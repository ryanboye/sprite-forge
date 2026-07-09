// validate.mjs — the "programmatic, not vibes" enforcement layer.
//
//   validate(stateTable, manifest?)  -> { ok, errors[], warnings[] }
//   bindManifest(stateTable, manifest) -> { ok, errors[], warnings[], table, frame(id), fps }
//
// validate() lints a state table on its own (structure, reachability, event
// ranges) and, when given a sprite-forge manifest, also proves every frame id a
// state references actually EXISTS as a shipped asset. bindManifest() runs the
// same checks AND fills in each state's fps from the manifest's suggested timing
// when the table omits it, returning a ready-to-run table plus a frame->asset
// lookup. Zero dependencies.
//
// Expected manifest shape (the sprite-forge assets-drop contract). Frames may be
// keyed by id OR an array of {id,file,w,h,anchor}; suggested fps may live under
// several keys — readManifest() below tolerates all of them:
//   {
//     "set": "husk",
//     "suggested": { "fps": 8 },              // or manifest.fps / manifest.timing.fps
//     "anchor": "feet",                        // default anchor semantics
//     "frames": {
//       "f00": { "file": "f00.png", "w": 130, "h": 220, "anchor": [65, 220] },
//       ...
//     }
//   }

// Read a manifest in any of its tolerated shapes into a normal form.
export function readManifest(manifest) {
  const meta = new Map();
  let fps;
  const src = manifest && manifest.frames;
  if (Array.isArray(src)) {
    for (const f of src) {
      const id = f.id ?? f.name ?? f.frame ?? f.key;
      if (id != null) meta.set(String(id), { file: f.file ?? f.src ?? `${id}.png`, w: f.w, h: f.h, anchor: f.anchor });
    }
  } else if (src && typeof src === 'object') {
    for (const [id, f] of Object.entries(src)) {
      const v = f && typeof f === 'object' ? f : {};
      meta.set(id, { file: v.file ?? v.src ?? `${id}.png`, w: v.w, h: v.h, anchor: v.anchor });
    }
  }
  if (manifest) {
    if (manifest.suggested && manifest.suggested.fps != null) fps = manifest.suggested.fps;
    else if (manifest.timing && manifest.timing.fps != null) fps = manifest.timing.fps;
    else if (manifest.fps != null) fps = manifest.fps;
    else if (manifest.suggestedFps != null) fps = manifest.suggestedFps;
  }
  return { ids: new Set(meta.keys()), meta, fps };
}

const isDeath = (name) => /death|dying|die$|^dead|corpse|gib/i.test(name);

export function validate(stateTable, manifest) {
  const errors = [];
  const warnings = [];
  const t = stateTable;

  if (!t || typeof t !== 'object' || !t.states || typeof t.states !== 'object') {
    return { ok: false, errors: ['stateTable.states is missing or not an object'], warnings };
  }
  const names = Object.keys(t.states);
  if (names.length === 0) errors.push('stateTable.states is empty');

  // start
  if (!t.start) errors.push('no `start` state declared');
  else if (!t.states[t.start]) errors.push(`start state "${t.start}" is not defined in states`);

  const man = manifest ? readManifest(manifest) : null;

  for (const name of names) {
    const s = t.states[name];
    if (!s || typeof s !== 'object') { errors.push(`state "${name}" is not an object`); continue; }

    // frames
    if (!Array.isArray(s.frames) || s.frames.length === 0) {
      errors.push(`state "${name}" has no frames`);
    } else if (man) {
      for (const fid of s.frames) {
        if (!man.ids.has(String(fid))) errors.push(`state "${name}" references frame "${fid}" which is missing from the manifest`);
      }
    }

    // next / @prev / @self
    if (s.next != null && s.next !== '@prev' && s.next !== '@self' && !t.states[s.next]) {
      errors.push(`state "${name}" has dangling next -> "${s.next}" (no such state)`);
    }

    // events keys within frame range
    if (s.events && typeof s.events === 'object') {
      const n = Array.isArray(s.frames) ? s.frames.length : 0;
      for (const k of Object.keys(s.events)) {
        const i = Number(k);
        if (!Number.isInteger(i) || i < 0) errors.push(`state "${name}" event key "${k}" is not a frame index`);
        else if (i >= n) errors.push(`state "${name}" event key "${k}" is out of frame range (0..${n - 1})`);
      }
    }

    // death should be locked so nothing revives / interrupts it
    if (isDeath(name) && !s.locked) {
      warnings.push(`state "${name}" looks like a death/corpse state but is not locked:true (it can be interrupted or restarted)`);
    }

    // a non-static, non-terminal state that neither loops nor advances freezes
    const fps = s.fps != null ? s.fps : t.fps;
    if ((fps == null || fps > 0) && Array.isArray(s.frames) && s.frames.length > 1 && !s.loop && s.next == null) {
      warnings.push(`state "${name}" has ${s.frames.length} frames but no loop and no next — it will freeze on the last frame`);
    }
  }

  // transitions target real states
  if (t.transitions && typeof t.transitions === 'object') {
    for (const [sig, target] of Object.entries(t.transitions)) {
      if (!t.states[target]) errors.push(`transition "${sig}" -> "${target}" targets an undefined state`);
    }
  }
  // priorities key real states
  if (t.priorities && typeof t.priorities === 'object') {
    for (const name of Object.keys(t.priorities)) {
      if (!t.states[name]) warnings.push(`priorities has "${name}" which is not a defined state`);
    }
  }

  // reachability from start (via next chains + transition targets)
  if (t.start && t.states[t.start]) {
    const reachable = new Set([t.start]);
    const q = [t.start];
    const targetsFrom = (name) => {
      const s = t.states[name] || {};
      const out = [];
      if (s.next === '@prev' || s.next === '@self') out.push(name);
      else if (s.next != null) out.push(s.next);
      return out;
    };
    // every transition target is reachable at runtime (signals fire anytime)
    const globalTargets = t.transitions ? Object.values(t.transitions).filter((x) => t.states[x]) : [];
    while (q.length) {
      const name = q.pop();
      for (const nx of [...targetsFrom(name), ...globalTargets]) {
        if (t.states[nx] && !reachable.has(nx)) { reachable.add(nx); q.push(nx); }
      }
    }
    for (const name of names) {
      if (!reachable.has(name)) warnings.push(`state "${name}" is unreachable (no next-chain or transition leads to it)`);
    }
  }

  // manifest sanity
  if (man && man.ids.size === 0) warnings.push('manifest has no frames (nothing to bind against)');

  return { ok: errors.length === 0, errors, warnings };
}

// Bind a state table to a sprite-forge manifest: validate every referenced frame
// exists, and fill missing per-state fps from the manifest's suggested timing.
// Returns a ready-to-run table plus a frame(id)->{file,w,h,anchor} lookup.
export function bindManifest(stateTable, manifest) {
  const man = readManifest(manifest);
  const res = validate(stateTable, manifest);
  const table = typeof structuredClone === 'function'
    ? structuredClone(stateTable)
    : JSON.parse(JSON.stringify(stateTable));
  if (man.fps != null) {
    for (const s of Object.values(table.states)) if (s.fps == null) s.fps = man.fps;
  }
  return {
    ok: res.ok,
    errors: res.errors,
    warnings: res.warnings,
    table,
    fps: man.fps,
    ids: [...man.ids],
    frame: (id) => man.meta.get(String(id)),
  };
}

export default validate;
