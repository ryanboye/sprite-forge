// test.mjs — no framework. Drives a real actor through its whole life and
// asserts every transition + event, then proves the validator catches broken
// tables. Run: node test.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createActor } from './actor-states.mjs';
import { validate, bindManifest, readManifest } from './validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(join(HERE, p), 'utf8'));
const table = load('demo-assets/husk.states.json');
const manifest = load('demo-assets/manifest.json');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FAIL:', msg); } };
const section = (s) => console.log(`\n— ${s}`);

// event capture
let events = [];
const onEvent = (name, ctx) => events.push({ name, state: ctx.state, frameIndex: ctx.frameIndex, frame: ctx.frame });
const clearEvents = () => { events = []; };
// advance the clock in small realistic steps
const run = (actor, seconds, dt = 1 / 240) => { for (let t = 0; t < seconds; t += dt) actor.update(dt); };

// ============================================================ binder + validate
section('bindManifest binds the demo table cleanly');
const bound = bindManifest(table, manifest);
ok(bound.ok, `bindManifest reports ok (errors: ${JSON.stringify(bound.errors)})`);
ok(bound.errors.length === 0, 'no binder errors');
ok(bound.frame('attack').file === 'husk_attack.png', 'frame() resolves manifest file for "attack"');
ok(bound.frame('dead').w === 412, 'frame() resolves measured width for "dead"');

section('bindManifest fills missing fps from manifest suggested timing');
const noFps = { start: 'idle', states: { idle: { frames: ['idle'], loop: true } }, transitions: {} };
const b2 = bindManifest(noFps, manifest);
ok(b2.fps === 8, 'suggested fps read from manifest (8)');
ok(b2.table.states.idle.fps === 8, 'idle.fps filled from suggested timing');

section('validate accepts the good table');
const v = validate(table, manifest);
ok(v.ok, `good table validates (errors: ${JSON.stringify(v.errors)})`);
ok(v.warnings.length === 0, `good table has no warnings (got: ${JSON.stringify(v.warnings)})`);

// ============================================================ life of an actor
section('spawn: actor starts idle on frame 0');
const a = createActor(bound.table, { onEvent });
ok(a.state() === 'idle', 'starts in idle');
ok(a.frame() === 'idle', 'idle shows frame "idle"');

section('see: sawPlayer signal -> walk, and the walk cycle actually animates');
ok(a.signal('sawPlayer') === true, 'sawPlayer transitioned');
ok(a.state() === 'walk', 'now walking');
clearEvents();
const seen = new Set();
for (let i = 0; i < 240; i++) { a.update(1 / 60); seen.add(a.frame()); }
ok(seen.has('idle') && seen.has('walk'), `walk cycle alternates frames (saw: ${[...seen]})`);

section('attack: inRange -> attack, fires dealDamage on frame 2, then returns to walk');
clearEvents();
ok(a.signal('inRange') === true, 'inRange transitioned to attack');
ok(a.state() === 'attack', 'in attack');
ok(a.frameIndex() === 0 && a.frame() === 'idle', 'attack begins on wind-up frame');
run(a, 0.5); // long enough to swing and fall through to walk
const dmg = events.filter((e) => e.name === 'dealDamage');
ok(dmg.length === 1, `dealDamage fired exactly once (got ${dmg.length})`);
ok(dmg[0] && dmg[0].frameIndex === 1 && dmg[0].frame === 'attack', 'dealDamage fired on the strike frame (index 1 / "attack")');
ok(a.state() === 'walk', 'attack.next returned the actor to walk');

section('pain interrupts walk (priority 50 > 1), then @prev resumes walk');
ok(a.state() === 'walk', 'walking before the hit');
ok(a.signal('damaged') === true, 'damaged interrupted walk');
ok(a.state() === 'pain', 'now in pain');
run(a, 0.3); // pain is 1 frame @ 12fps -> resolves to @prev
ok(a.state() === 'walk', 'pain resumed to the interrupted state (walk) via @prev');

section('nothing interrupts death; death -> corpse is terminal');
ok(a.signal('died') === true, 'died -> death');
ok(a.state() === 'death', 'in death');
ok(a.signal('sawPlayer') === false, 'sawPlayer cannot interrupt death');
ok(a.signal('damaged') === false, 'damaged cannot interrupt death');
ok(a.set('walk') === false, 'set(walk) refused while death is locked');
ok(a.state() === 'death', 'still dead after interrupt attempts');
run(a, 0.4); // death 1 frame @6fps -> next corpse
ok(a.state() === 'corpse', 'death.next reached corpse');
ok(a.isDone() === true, 'corpse is frozen (fps 0)');
run(a, 1.0);
ok(a.state() === 'corpse', 'corpse stays put');
ok(a.signal('died') === false, 'corpse cannot be re-triggered');
ok(a.set('idle') === false, 'corpse locked against set()');
ok(a.set('idle', { force: true }) === true, 'force:true revives (the escape hatch)');
ok(a.state() === 'idle', 'revived to idle');

// ============================================================ rotationFrame math
section('rotationFrame picks the view-relative billboard (Doom 8-way)');
const step = (Math.PI * 2) / 8;
ok(a.rotationFrame(0, 0, 8) === 0, 'aligned actor/view -> rotation 0');
ok(a.rotationFrame(step, 0, 8) === 1, '+1 step -> rotation 1');
ok(a.rotationFrame(4 * step, 0, 8) === 4, 'half turn -> rotation 4');
ok(a.rotationFrame(-step, 0, 8) === 7, 'negative wraps -> rotation 7');
ok(a.rotationFrame(step * 0.49, 0, 8) === 0, 'rounds toward nearest facing (under half step)');
ok(a.rotationFrame(step * 0.51, 0, 8) === 1, 'rounds toward nearest facing (over half step)');
ok(a.rotationFrame(1.234, 1.234, 1) === 0, 'degrades to single-view (rotations<=1 -> 0)');

// ============================================================ validator catches broken tables
section('validator catches 5 broken tables');
const broken = [
  ['no start', { states: { idle: { frames: ['idle'] } } }, null, /no .start/i],
  ['start not a state', { start: 'boot', states: { idle: { frames: ['idle'] } } }, null, /start state .* not defined/i],
  ['dangling next', { start: 'idle', states: { idle: { frames: ['idle'], next: 'ghost' } } }, null, /dangling next/i],
  ['missing frame vs manifest', { start: 'idle', states: { idle: { frames: ['nope'] } } }, manifest, /missing from the manifest/i],
  ['event out of range', { start: 'idle', states: { idle: { frames: ['idle'], events: { '5': 'boom' } } } }, null, /out of frame range/i],
];
for (const [label, tbl, man, re] of broken) {
  const r = validate(tbl, man);
  ok(r.ok === false, `[${label}] validation fails`);
  ok(r.errors.some((e) => re.test(e)), `[${label}] emits the expected error (got: ${JSON.stringify(r.errors)})`);
}

section('validator warns on an unlocked death state');
const wr = validate({ start: 'idle', states: { idle: { frames: ['idle'], loop: true }, death: { frames: ['idle'] } }, transitions: { died: 'death' } });
ok(wr.warnings.some((w) => /not locked/i.test(w)), 'unlocked death -> warning');

// ============================================================ createActor guards
section('createActor fails fast on a bad start');
let threw = false;
try { createActor({ states: { idle: { frames: ['idle'] } } }); } catch { threw = true; }
ok(threw, 'createActor throws when start is missing');

// ============================================================ report
console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
