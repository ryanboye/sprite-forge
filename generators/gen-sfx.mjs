// gen-sfx.mjs — AI sound-effects generator for games (ElevenLabs text-to-SFX).
// The audio arm of the asset pipeline: describe a sound, get a game-ready mp3.
//
//   node gen-sfx.mjs "<prompt>" out.mp3 [durationSeconds] [promptInfluence]
//   node gen-sfx.mjs "punchy sci-fi plasma rifle shot, single, crisp" sfx/fire.mp3 1.2 0.6
//
// Key: ELEVENLABS_API_KEY from env, falling back to ~/.env.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const KEY = process.env.ELEVENLABS_API_KEY
  || readFileSync(process.env.HOME + '/.env', 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');

const [prompt, out, dur, influence] = process.argv.slice(2);
if (!prompt || !out) {
  console.error('usage: node gen-sfx.mjs "<prompt>" out.mp3 [durationSeconds 0.5-22] [promptInfluence 0-1]');
  process.exit(1);
}

const body = { text: prompt, prompt_influence: influence ? +influence : 0.5 };
if (dur) body.duration_seconds = +dur; // omit → ElevenLabs auto-picks length

const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
  method: 'POST',
  headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`ElevenLabs ${res.status}:`, (await res.text()).slice(0, 300));
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`wrote ${out} (${buf.length} bytes)`);
