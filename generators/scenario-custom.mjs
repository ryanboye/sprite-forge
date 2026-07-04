// Scenario custom-model generator (video / 3D / anything on /generate/custom/{modelId}).
// Usage:
//   node scenario-custom.mjs <modelId> <outfile> [--prompt "..."] [--image <assetId-or-file>]
//                            [--duration 5] [--fps 24] [--aspectRatio 16:9]
//                            [--steps N] [--guidanceScale N] [--targetFaceNum N] [--paint]
// Known modelIds: model_veo3, model_kling-v2-1 (video); model_hunyuan-3d-v2-1 (image->3D).
// A local --image file is uploaded to /assets first. Output extension decides expectations
// (.mp4/.webm video, .glb 3D, .png image) but we just save whatever asset comes back.
import { readFileSync, writeFileSync, statSync } from 'fs';

const args = process.argv.slice(2);
const modelId = args.shift(), outfile = args.shift();
if (!modelId || !outfile) { console.error('usage: scenario-custom.mjs <modelId> <outfile> [--flags]'); process.exit(1); }
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const k = args[i].slice(2);
    if (i + 1 < args.length && !args[i + 1].startsWith('--')) { flags[k] = args[++i]; } else { flags[k] = true; }
  }
}

const env = process.env.SCENARIO_API_KEY ? '' : readFileSync(process.env.HOME + '/.env', 'utf8');
const KEY = process.env.SCENARIO_API_KEY || env.match(/^SCENARIO_API_KEY=(.*)$/m)[1].trim();
const SEC = process.env.SCENARIO_API_SECRET || env.match(/^SCENARIO_API_SECRET=(.*)$/m)[1].trim();
const AUTH = 'Basic ' + Buffer.from(`${KEY}:${SEC}`).toString('base64');
const API = 'https://api.cloud.scenario.com/v1';
const H = { Authorization: AUTH, 'Content-Type': 'application/json' };

// upload local image file to assets if --image points at a file on disk
if (flags.image && !flags.image.startsWith('asset_')) {
  const b64 = readFileSync(flags.image).toString('base64');
  const up = await (await fetch(`${API}/assets`, { method: 'POST', headers: H, body: JSON.stringify({ image: `data:image/png;base64,${b64}`, name: 'sprite-forge-hero.png' }) })).json();
  const id = up.asset?.id;
  if (!id) { console.error('UPLOAD FAILED:', JSON.stringify(up).slice(0, 300)); process.exit(2); }
  console.log('uploaded image ->', id);
  flags.image = id;
}

const body = { ...flags };
if (body.image && modelId.includes('kling') || body.image && modelId.includes('veo')) {
  body.startImage = body.image; // video models take the first frame as startImage
  delete body.image;
}
for (const k of ['duration', 'fps', 'steps', 'guidanceScale', 'targetFaceNum']) if (body[k] !== undefined) body[k] = Number(body[k]);
if (body.paint !== undefined) body.paint = body.paint === true || body.paint === 'true';

const sub = await (await fetch(`${API}/generate/custom/${modelId}`, { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
const jobId = sub.job?.jobId;
if (!jobId) { console.error('SUBMIT FAILED:', JSON.stringify(sub).slice(0, 400)); process.exit(2); }
console.log('job', jobId, 'submitted, polling...');

let assetIds = [];
for (let i = 0; i < 200; i++) {
  await new Promise(r => setTimeout(r, 6000));
  const jr = await (await fetch(`${API}/jobs/${jobId}`, { headers: H })).json();
  const st = jr.job?.status;
  if (i % 5 === 0) console.log('  status:', st, jr.job?.progress ?? '');
  if (st === 'success') { assetIds = jr.job.metadata?.assetIds ?? []; break; }
  if (st === 'failed' || st === 'failure' || st === 'canceled') { console.error('JOB FAILED:', JSON.stringify(jr.job).slice(0, 400)); process.exit(2); }
}
if (!assetIds.length) { console.error('TIMEOUT/no assets for', jobId); process.exit(2); }

const ar = await (await fetch(`${API}/assets/${assetIds[0]}`, { headers: H })).json();
const url = ar.asset?.url;
const data = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync(outfile, data);
console.log(`OK ${outfile} (${statSync(outfile).size} bytes, ${modelId}, asset ${assetIds[0]})`);
