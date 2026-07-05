// Img2img angle/edit generator. Usage:
//   node gen-edit.mjs "<prompt>" <outfile.png> <ref1.png> [ref2.png ...] [--aspect 2:3]
// Backend: OpenAI gpt-image-2 images/edits — the identity-preserving workhorse for
// deriving NEW ANGLES of an existing sprite (won 4/4 vs scenario, see LEARNINGS.md).
// Feed the canonical FRONT sprite as the reference; prompt the rotated view.
// (STANDING RULE 2026-07-03: never route to Gemini.)
import { readFileSync, writeFileSync, statSync } from 'fs';
import { loadKey } from './_env.mjs';

const argv = process.argv.slice(2);
let aspect = '2:3';
const ai = argv.indexOf('--aspect');
if (ai !== -1) { aspect = argv[ai + 1]; argv.splice(ai, 2); }
const [prompt, outfile, ...refs] = argv;
if (!prompt || !outfile || refs.length === 0) {
  console.error('usage: node gen-edit.mjs "<prompt>" <out.png> <ref1.png> [ref2 ...] [--aspect 2:3]');
  process.exit(1);
}
const KEY = loadKey('OPENAI_API_KEY');
const SIZE = { '1:1': '1024x1024', '2:3': '1024x1536', '9:16': '1024x1536', '3:2': '1536x1024', '16:9': '1536x1024' }[aspect] ?? '1024x1536';

const fd = new FormData();
fd.append('model', 'gpt-image-2');
fd.append('prompt', prompt);
fd.append('size', SIZE);
fd.append('n', '1');
for (const r of refs) fd.append('image[]', new Blob([readFileSync(r)], { type: 'image/png' }), r.split('/').pop());

const res = await fetch('https://api.openai.com/v1/images/edits', {
  method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd,
});
const json = await res.json();
if (json.error) { console.error('FAILED:', JSON.stringify(json.error).slice(0, 400)); process.exit(2); }
const b64 = json.data?.[0]?.b64_json;
if (!b64) { console.error('FAILED: no b64', JSON.stringify(json).slice(0, 300)); process.exit(2); }
writeFileSync(outfile, Buffer.from(b64, 'base64'));
console.log(`OK ${outfile} (${statSync(outfile).size} bytes, ${SIZE})`);
