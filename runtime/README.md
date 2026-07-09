# actor-states

A tiny, **engine-agnostic sprite state-machine runtime**. It turns a pile of
frames + a manifest (what the sprite-forge pipeline produces) into a *living
actor*: enemy animation becomes a **data table you can lint**, not a wall of
`if (state === ...)` vibes.

Lineage: Doom drove every monster from declarative state tables (`info.c`,
later DECORATE). This copies that shape. Zero dependencies, one ES module of
pure logic — no DOM, no images, no network. Drop it into any canvas / raycaster
/ three.js game.

```
runtime/
  actor-states.mjs   the runtime (createActor)
  validate.mjs       validate() linter + bindManifest() for sprite-forge manifests
  demo.html          self-contained visual demo (patrol + signals + turntable)
  test.mjs           node, no framework — drives a full actor life + lints 5 broken tables
  demo-assets/       husk state table + manifest + sprites used by the demo
```

Run the tests: `node test.mjs` · See it move: open `demo.html` (served, so ES
modules load) — or the checked-in `demo-screenshot.png`.

---

## The state table (pure JSON)

```json
{
  "start": "idle",
  "fps": 8,
  "priorities": { "death": 100, "pain": 50, "attack": 10, "walk": 1, "idle": 0 },
  "transitions": { "sawPlayer": "walk", "inRange": "attack", "damaged": "pain", "died": "death" },
  "states": {
    "idle":   { "frames": ["idle"],           "fps": 2,  "loop": true },
    "walk":   { "frames": ["idle", "walk"],   "fps": 6,  "loop": true },
    "attack": { "frames": ["idle", "attack"], "fps": 8,  "next": "walk", "events": { "1": "dealDamage" } },
    "pain":   { "frames": ["idle"],           "fps": 12, "next": "@prev" },
    "death":  { "frames": ["dead"],           "fps": 6,  "next": "corpse", "locked": true },
    "corpse": { "frames": ["dead"],           "fps": 0,  "locked": true }
  }
}
```

**Table fields**

| field | meaning |
|---|---|
| `start` | initial state name (required) |
| `fps` | default fps for states that omit their own (optional) |
| `states` | the state map (required) |
| `priorities` | `state -> number`. Higher = harder to interrupt. A signal/`set` may interrupt the current state only when the target's priority `>=` the current's. |
| `transitions` | `signalName -> stateName`. Game AI emits signals; the table decides the state. |

**State fields**

| field | meaning |
|---|---|
| `frames` | array of **frame ids** — the same ids your asset manifest uses (required) |
| `fps` | frames/sec. `0` (or absent + no table default) = static hold |
| `loop` | when the sequence ends, wrap to frame 0 and keep going |
| `next` | when the sequence ends, transition to this state (beats `loop`). Specials: `"@prev"` = the state that was interrupted, `"@self"` = restart |
| `events` | `{ "<frameIndex>": "name" \| ["a","b"] }` — fired via `onEvent` when that frame is **entered** |
| `locked` | nothing may interrupt this state via `set`/`signal` (death). Its own scripted `next` still runs. `force:true` overrides |
| `priority` | per-state override of `priorities[name]` |

With neither `loop` nor `next`, a state **freezes on its last frame** (that's
how `corpse` with `fps:0` is terminal).

---

## Runtime API

```js
import { createActor } from './actor-states.mjs';

const actor = createActor(stateTable, {
  onEvent(name, ctx) { /* ctx = { actor, state, frame, frameIndex } */ }
});

actor.update(dt);        // advance the frame clock by dt SECONDS (call every tick)
actor.set('walk');       // explicit command; honours locked-current (force:true to override)
actor.signal('sawPlayer');// emit a game event -> maps via transitions, respects priority/locking
actor.frame();           // -> current frame id (e.g. "walk")  — feed this to your renderer
actor.state();           // -> current state name
actor.frameIndex();      // -> index within the current state
actor.isLocked();        // -> true while in a locked state (death/corpse)
actor.isDone();          // -> true while frozen on a final/static frame
actor.rotationFrame(actorAngle, viewAngle, rotations = 8); // -> 0..N-1 view-relative billboard
```

`signal` / `set` return `true` when a transition happened, `false` when it was
refused (unknown signal, blocked by priority, or a locked state).

### The events contract

An event fires **once, the moment its frame is entered** — on initial enter,
on every loop wrap, and on `next`-driven re-entry. Keys are frame **indices**
(strings). The handler gets `(name, ctx)`; do the game-side effect there:

```js
onEvent(name, ctx) {
  if (name === 'dealDamage' && dist(enemy, player) < enemy.reach) hurt(player, 8);
  if (name === 'footstep') playSfx('step');
}
```

This is the "deal damage on frame 2 of the swing" hook — the damage is tied to
the *animation frame*, not a guessed timer.

### Priority & locking (interrupts, the Doom way)

- `pain` (priority 50) interrupts `walk` (1) → then `next:"@prev"` resumes walk.
- `death` (100) interrupts anything, is `locked`, and `next:"corpse"` is terminal.
- Nothing interrupts a locked state — `signal`/`set` return `false` — except
  `set(name, { force: true })` (respawn / editor override).

### rotationFrame (8-way billboards)

Pure math: given the actor's facing and the camera's view angle (radians), it
returns which of `N` rotations the camera should see. The runtime stays
engine-agnostic — *you* map the index to a sprite, via a lookup or a naming
convention:

```js
const DIRS = ['s','se','e','ne','n','nw','w','sw'];        // your art's order
const rot = actor.rotationFrame(enemy.angle, camera.angle, 8);
const sprite = assets[`${actor.frame()}_${DIRS[rot]}`];    // e.g. "walk_ne"
```

Pass `rotations = 1` (or omit rotation art) to degrade gracefully to single-view.

---

## Binding to a sprite-forge manifest

`bindManifest(table, manifest)` validates that every frame id a state references
**exists** as a shipped asset, and fills each state's `fps` from the manifest's
suggested timing when the table omits it. It returns a ready-to-run table plus a
`frame(id) -> { file, w, h, anchor }` lookup.

```js
import { bindManifest } from './validate.mjs';

const bound = bindManifest(stateTable, manifest);
if (!bound.ok) throw new Error(bound.errors.join('\n')); // dangling frames caught here
const actor = createActor(bound.table, { onEvent });
const meta = bound.frame(actor.frame());  // { file:'husk_walk.png', w, h, anchor:[x,y] }
```

Expected manifest shape (the assets-drop contract; `frames` may also be an
array of `{ id, file, w, h, anchor }`, and suggested fps may live under
`suggested.fps`, `timing.fps`, or `fps`):

```json
{
  "set": "husk",
  "suggested": { "fps": 8 },
  "frames": {
    "f00": { "file": "f00.png", "w": 130, "h": 220, "anchor": [65, 220] }
  }
}
```

## The linter (`validate`)

```js
import { validate } from './validate.mjs';
const { ok, errors, warnings } = validate(stateTable, manifest /* optional */);
```

Catches, with readable messages:

- no `start`, or a `start` that isn't a defined state
- states with no frames
- **dangling `next`** (points at a state that doesn't exist)
- **frame ids missing from the manifest** (when a manifest is passed)
- **event keys out of frame range**
- transitions / priorities pointing at undefined states
- **unreachable states** (nothing leads to them) — warning
- a death-looking state that isn't `locked` — warning
- a multi-frame state with no `loop` and no `next` (silently freezes) — warning

This is the "programmatic, not vibes" part: a broken enemy fails the linter
instead of the playtest.

---

## Integrate in ~20 lines (a raycaster / billboard game)

```js
import { createActor } from './actor-states.mjs';
import { bindManifest } from './validate.mjs';

const bound = bindManifest(huskTable, huskManifest);        // lint at load
const actor = createActor(bound.table, {
  onEvent(name) { if (name === 'dealDamage' && canReach(enemy, player)) hurt(player, 8); }
});

function tick(dt) {
  // --- game AI just emits signals; the table owns the animation ---
  if (sees(enemy, player))  actor.signal('sawPlayer');
  if (inRange(enemy, player)) actor.signal('inRange');
  if (enemy.hp <= 0)        actor.signal('died');

  actor.update(dt);                                          // advance the clock

  // --- draw: frame id -> asset -> billboard at the feet anchor ---
  const rot   = actor.rotationFrame(enemy.angle, camera.angle, 8);
  const asset = assets[`${actor.frame()}_${DIRS[rot]}`] || assets[actor.frame()];
  drawBillboard(asset, enemy.pos, bound.frame(actor.frame()).anchor);
}
```

When the enemy takes a hit: `actor.signal('damaged')` → it flinches (pain
interrupts, priority 50) and resumes exactly what it was doing via `@prev`.

---

## Worked example: how Finn wires ECHO VESSEL enemies

The husk in `demo-assets/` is the template. To add a choir enemy end-to-end:

1. **Drop the assets.** The pipeline writes
   `assets-drop/<set>/manifest.json` + frames (`f00.png…`, measured `w/h`,
   `anchor`, suggested `fps`). No timing decisions live in the art.
2. **Write the state table** (a `.json` like `demo-assets/husk.states.json`).
   Name the frames by their manifest ids. Give `death` `locked:true` and a
   `corpse`; put a `dealDamage` event on the strike frame of `attack`.
3. **Lint before you wire it:** `node -e "import('./validate.mjs').then(v =>
   console.log(v.validate(table, manifest)))"` — or call `bindManifest` and
   check `.ok`. Missing frame? Dangling `next`? Caught now, not in a playtest.
4. **In the game loop**, your existing AI (line-of-sight, range, hp) emits
   signals — `sawPlayer`, `inRange`, `damaged`, `died`. The runtime owns frames,
   timing, the damage event, pain interrupts, and the terminal death→corpse.
   Nothing about the animation lives in your `if` statements anymore.

### 10-line snippet for ECHO VESSEL

```js
import { createActor } from './actor-states.mjs';
import { bindManifest } from './validate.mjs';
import table    from './choir-husk.states.json'         with { type: 'json' };
import manifest from './assets-drop/husk/manifest.json' with { type: 'json' };

const bound = bindManifest(table, manifest);           // lints frames vs assets
const husk  = createActor(bound.table, { onEvent: (n) => n === 'dealDamage' && hitPlayer(8) });
// per frame:
husk.signal(sees ? 'sawPlayer' : null); husk.signal(hp <= 0 ? 'died' : null);
husk.update(dt);
drawSprite(assets[husk.frame()], enemyPos, bound.frame(husk.frame()).anchor);
```

---

Upstream lives in **sprite-forge** (`github.com/ryanboye/sprite-forge`), under
`runtime/`. Same toolchain family as the asset pipeline that feeds it.
