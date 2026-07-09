// actor-states — a tiny, engine-agnostic sprite STATE MACHINE runtime.
//
// The runtime companion to the sprite-forge asset pipeline: the pipeline makes
// frames + a manifest; this makes them a living actor. Enemy animation becomes
// programmatic (a data table + a clock) instead of vibes.
//
// Design lineage: Doom drove every monster from declarative state tables
// (info.c / DECORATE). Same idea here — the behaviour is DATA, the runtime is
// ~1 file of pure logic with ZERO dependencies. Works in any canvas / raycaster
// / three.js game; it never touches the DOM, images, or the network.
//
// State-table shape (all JSON, see README for the full schema):
//   {
//     start: "idle",
//     fps: 8,                                 // table-level default fps (optional)
//     priorities: { death:100, pain:50 },     // interrupt strength per state
//     transitions: { sawPlayer:"walk", damaged:"pain", died:"death" }, // signal -> state
//     states: {
//       idle:   { frames:["f00"],        fps:2,  loop:true },
//       walk:   { frames:["f01","f02"],  fps:7,  loop:true },
//       attack: { frames:["f03","f04"],  fps:10, next:"walk", events:{ "1":"dealDamage" } },
//       pain:   { frames:["f05"],        fps:12, next:"@prev", interrupts:true },
//       death:  { frames:["f06","f07"],  fps:8,  next:"corpse", locked:true },
//       corpse: { frames:["f07"],        fps:0,  locked:true }
//     }
//   }
//
// State fields:
//   frames   (required) array of frame ids — the ids your asset manifest uses.
//   fps      frames per second. 0 (or absent + no table default) = static hold.
//   loop     when the sequence ends, wrap to frame 0 and keep going.
//   next     when the sequence ends, transition to this state. Beats `loop`.
//            Special: "@prev" = the state that was interrupted, "@self" = restart.
//            With neither loop nor next, the actor freezes on the last frame.
//   events   { "<frameIndex>": "eventName" | ["a","b"] } — fired via onEvent when
//            that frame is ENTERED (the "deal damage on frame 2 of attack" hook).
//   locked   nothing may interrupt this state via set()/signal() (death). Its own
//            scripted `next` still runs (death -> corpse). force:true overrides.
//   priority interrupt strength (else table.priorities[name], else 0). A signal/set
//            may only interrupt the current state when its priority >= the current.

const TAU = Math.PI * 2;

class Actor {
  constructor(table, { onEvent } = {}) {
    if (!table || typeof table !== 'object' || !table.states) {
      throw new Error('createActor: stateTable.states is required');
    }
    const start = table.start;
    if (!start || !table.states[start]) {
      throw new Error(`createActor: start state '${start}' is not defined in states`);
    }
    this.table = table;
    this.states = table.states;
    this.onEvent = onEvent || null;
    this.cur = start;       // current state name
    this.prev = start;      // state before the current one (for "@prev")
    this.idx = 0;           // current frame index within the state
    this.clock = 0;         // seconds accumulated toward the next frame
    this.frozen = false;    // true when holding a final/static frame
    this._go(start);        // enter start cleanly (fires its frame-0 events)
  }

  // ---- introspection ------------------------------------------------------
  state() { return this.cur; }
  frame() { return this.states[this.cur].frames[this.idx]; }
  frameIndex() { return this.idx; }
  isLocked() { return !!this.states[this.cur].locked; }
  isDone() { return this.frozen; }

  _fps(name) {
    const s = this.states[name];
    const f = s && s.fps != null ? s.fps : this.table.fps;
    return f != null ? f : 0;
  }
  _priority(name) {
    const s = this.states[name] || {};
    if (s.priority != null) return s.priority;
    const p = this.table.priorities;
    return p && p[name] != null ? p[name] : 0;
  }

  // ---- transitions --------------------------------------------------------
  // Direct, explicit set (a command). Honours a locked current state unless
  // force:true, but ignores priority — the game author is in charge here.
  set(name, { force = false } = {}) {
    if (!this.states[name]) throw new Error(`set: unknown state '${name}'`);
    if (!force && this.states[this.cur].locked) return false;
    this._go(name);
    return true;
  }

  // Emit a game event. Maps through table.transitions (else treats `name` as a
  // state name directly), then interrupts only if priority/locking allow it.
  // Returns true if a transition happened.
  signal(name, { force = false } = {}) {
    let target = this.table.transitions && this.table.transitions[name];
    if (!target && this.states[name]) target = name;
    if (!target) return false; // unknown signal — ignore, don't throw
    if (!this._canEnter(target, force)) return false;
    this._go(target);
    return true;
  }

  _canEnter(target, force) {
    if (force) return true;
    if (!this.states[target]) return false;
    if (target === this.cur) return false;            // no self-restart via signal
    if (this.states[this.cur].locked) return false;   // locked (death) blocks all
    return this._priority(target) >= this._priority(this.cur);
  }

  _resolveNext(next) {
    if (next === '@prev') return this.states[this.prev] ? this.prev : this.table.start;
    if (next === '@self') return this.cur;
    return next;
  }

  // Enter a state, resetting the frame clock and firing its frame-0 events.
  _go(name) {
    this.prev = this.cur;
    this.cur = name;
    this.idx = 0;
    this.clock = 0;
    this.frozen = this._fps(name) <= 0;
    this._fire(0);
  }

  _fire(i) {
    const evs = this.states[this.cur].events;
    if (!evs || !this.onEvent) return;
    const e = evs[String(i)];
    if (e == null) return;
    const ctx = { actor: this, state: this.cur, frame: this.frame(), frameIndex: i };
    if (Array.isArray(e)) for (const n of e) this.onEvent(n, ctx);
    else this.onEvent(e, ctx);
  }

  // ---- the clock ----------------------------------------------------------
  // Advance the animation by dt seconds. Honours loop / next / @prev, fires
  // per-frame events, and freezes static or terminal states.
  update(dt) {
    if (this.frozen || !(dt > 0)) return;
    const fps = this._fps(this.cur);
    if (fps <= 0) { this.frozen = true; return; }
    const dur = 1 / fps;
    this.clock += dt;
    let guard = 0;
    while (this.clock >= dur && !this.frozen) {
      if (++guard > 100000) break; // paranoia against fps==Infinity style abuse
      this.clock -= dur;
      const st = this.states[this.cur];
      const last = st.frames.length - 1;
      if (this.idx < last) {
        this.idx++;
        this._fire(this.idx);
      } else if (st.next != null) {
        this._go(this._resolveNext(st.next));
        return; // new state owns the remaining time next tick
      } else if (st.loop) {
        this.idx = 0;
        this._fire(0);
      } else {
        this.frozen = true; // hold the final frame
      }
    }
  }

  // ---- view-relative rotation (Doom's 8-way billboards) -------------------
  // Given the actor's facing angle and the viewer/camera angle (radians), pick
  // which of N rotation frames the camera should see. Returns an integer index
  // 0..N-1; the game maps it to a sprite (assets[frame()][rot], or a naming
  // convention like `${frame()}_${DIRS[rot]}`). Degrades to 0 for single-view.
  rotationFrame(actorAngle, viewAngle, rotations = 8) {
    if (!rotations || rotations <= 1) return 0;
    let rel = (actorAngle - viewAngle) % TAU;
    if (rel < 0) rel += TAU;
    const step = TAU / rotations;
    return Math.round(rel / step) % rotations;
  }

  reset() { this.prev = this.table.start; this._go(this.table.start); }
}

export function createActor(stateTable, opts = {}) {
  return new Actor(stateTable, opts);
}

export default createActor;
