// Image generator for the build. Usage:
//   node gen-image.mjs "<prompt>" <outfile.png> [aspectRatio]
// aspectRatio: "1:1" (default), "2:3", "3:2", "9:16", "16:9"
// Backend: OpenAI gpt-image-2 (STANDING RULE 2026-07-03: never route to Gemini).
import { readFileSync, writeFileSync, statSync } from 'fs';

const [prompt, outfile, aspect = '1:1'] = process.argv.slice(2);
if (!prompt || !outfile) {
  console.error('usage: node gen-image.mjs "<prompt>" <outfile.png> [aspectRatio]');
  process.exit(1);
}

const KEY = process.env.OPENAI_API_KEY
  || readFileSync(process.env.HOME + '/.env', 'utf8').match(/^OPENAI_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const SIZE = { '1:1': '1024x1024', '2:3': '1024x1536', '9:16': '1024x1536', '3:2': '1536x1024', '16:9': '1536x1024' }[aspect] ?? '1024x1024';

const res = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-image-2', prompt, size: SIZE, n: 1 }),
});
const json = await res.json();
if (json.error) {
  console.error('FAILED:', JSON.stringify(json.error).slice(0, 300));
  process.exit(2);
}
const b64 = json.data?.[0]?.b64_json;
if (!b64) { console.error('FAILED: no b64 payload', JSON.stringify(json).slice(0, 200)); process.exit(2); }
writeFileSync(outfile, Buffer.from(b64, 'base64'));
console.log(`OK ${outfile} (${statSync(outfile).size} bytes, ${SIZE})`);
