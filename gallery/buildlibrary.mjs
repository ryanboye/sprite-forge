// Build the asset library: copy every generated asset + emit a manifest the
// viewer renders. Run after any asset change: node tools/buildlibrary.mjs
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OUT = 'library';
mkdirSync(join(OUT, 'a'), { recursive: true });

const A = []; // manifest entries
const cp = (src, name) => { copyFileSync(src, join(OUT, 'a', name)); return 'a/' + name; };

// ---- weapon frame sheets (2x2, chroma)
A.push({ id: 'gun', title: 'Carbine viewmodel', type: 'sheet', chroma: true, grid: [2, 2],
  cells: ['idle', 'fire 1', 'fire 2', 'fire 3'], src: cp('src/assets/gun.png', 'gun.png'),
  note: 'gpt-image-2, pass 1 (F showcase)' });
A.push({ id: 'scattergun', title: 'Riot scattergun viewmodel', type: 'sheet', chroma: true, grid: [2, 2],
  cells: ['idle', 'fire', 'recoil peak', 'settle'], src: cp('src/assets/scattergun.png', 'scattergun.png'),
  note: 'gpt-image-2, pass 5 — first-try sheet' });

// ---- video-derived reload sequence
A.push({ id: 'reload', title: 'Carbine reload (sprite-forge)', type: 'anim', chroma: false, fps: 6,
  frames: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => cp(`src/assets/reload/f${i}.png`, `reload-f${i}.png`)),
  note: 'kling img2vid → ffmpeg → gpt-image-2 repair pass → keyed. R in game.' });

// ---- enemies (front sheets + rotation sheets)
for (const e of ['husk', 'spitter', 'stalker', 'warden']) {
  A.push({ id: `enemy-${e}`, title: `${e} — front`, type: 'sheet', chroma: true, grid: [2, 2],
    cells: ['walk A', 'walk B', 'attack', 'corpse'], src: cp(`src/assets/enemy-${e}.png`, `enemy-${e}.png`),
    note: 'gpt-image-2 sheet (pass 2)' });
  A.push({ id: `enemy-${e}-rot`, title: `${e} — rotations`, type: 'sheet', chroma: true, grid: [2, 2],
    cells: ['back A', 'back B', 'side A', 'side B'], src: cp(`src/assets/enemy-${e}-rot.png`, `enemy-${e}-rot.png`),
    note: 'derived from front frames via gpt-image-2 edits (pass 3 img2img audition winner)' });
}

// ---- looping ambient animations
A.push({ id: 'anim-spark', title: 'Arcing conduit (loop)', type: 'animsheet', chroma: true, grid: [2, 2], fps: 7,
  cells: ['dormant', 'sparks', 'ARC', 'smoke'], src: cp('src/assets/anim-spark.png', 'anim-spark.png'),
  note: 'gpt-image-2 loop sheet — arc frame self-lights in engine' });
A.push({ id: 'anim-drip', title: 'Biomass drip (loop)', type: 'animsheet', chroma: true, grid: [2, 2], fps: 4.5,
  cells: ['swell', 'elongate', 'fall', 'splash'], src: cp('src/assets/anim-drip.png', 'anim-drip.png'),
  note: 'gpt-image-2 loop sheet — hangs from garden ceiling' });

// ---- props
A.push({ id: 'props', title: 'Props — medpod / gurney / chair / eggs', type: 'sheet', chroma: true, grid: [2, 2],
  cells: ['medpod', 'gurney', 'chair', 'eggs'], src: cp('src/assets/props.png', 'props.png') });
A.push({ id: 'props-rot', title: 'Prop rotations + gurney block tex', type: 'sheet', chroma: false, grid: [2, 2],
  cells: ['chair back', 'chair side', 'gurney top', 'gurney side'], src: cp('src/assets/props-rot.png', 'props-rot.png') });
A.push({ id: 'medpod-rot', title: 'Medpod rotations', type: 'sheet', chroma: true, grid: [2, 2],
  cells: ['back', 'flank N', 'flank S', '(unused)'], src: cp('src/assets/medpod-rot.png', 'medpod-rot.png') });
A.push({ id: 'items', title: 'Items — muzzle / ammo / medkit / key', type: 'sheet', chroma: true, grid: [2, 2],
  cells: ['muzzle flash', 'ammo cells', 'medkit', 'keycard'], src: cp('src/assets/items.png', 'items.png') });

// ---- walls & flats (textures)
const wallSets = {
  'walls-a': ['hull', 'rust', 'tech', 'door'], 'walls-b': ['nest', 'crates', 'security', 'pod airlock'],
  'walls-c': ['medbay', 'medtech', 'quarters', 'mess'], 'walls-d': ['infested hull', 'infested tech', 'reactor', 'pod bay'],
  'walls-e': ['console', 'viewport (stars keyed)', 'star chart', 'powered door'],
  'flats': ['deck plate', 'grating', 'fixture ceil', 'pipe ceil'],
  'flats-b': ['medbay floor', 'infested floor', 'medbay ceil', 'infested ceil'],
  'flats-c': ['bridge floor', 'mess floor', 'bridge ceil', 'engineering floor'],
};
for (const [f, cells] of Object.entries(wallSets)) {
  A.push({ id: f, title: f, type: 'sheet', chroma: false, grid: [2, 2], cells, src: cp(`src/assets/${f}.png`, `${f}.png`) });
}

// ---- full art + forge videos
A.push({ id: 'title', title: 'Title screen art', type: 'art', src: cp('src/assets/title.png', 'title.png') });
A.push({ id: 'won', title: 'Win screen art', type: 'art', src: cp('src/assets/won.png', 'won.png') });
for (const [f, t] of [['reload-kling.mp4', 'Kling take 1 — theatrical (rejected)'],
  ['reload-kling2.mp4', 'Kling take 2 — the reload source'],
  ['reload-ingame-v2.mp4', 'Reload running in-game (post repair)']]) {
  if (existsSync(`forge/${f}`)) A.push({ id: f.replace('.mp4', ''), title: t, type: 'video', src: cp(`forge/${f}`, f) });
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ built: 'HULLROT / ECS Meridian — generated asset library', assets: A }, null, 1));
console.log(`library built: ${A.length} assets`);
