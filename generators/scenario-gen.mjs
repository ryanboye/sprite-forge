// Scenario.com image generator. Usage:
//   node scenario-gen.mjs "<prompt>" <outfile.png> [modelId] [WxH]
// modelId default: flux.1-dev. Size default 1024x1024.
// Catalog: https://api.cloud.scenario.com/v1/models?privacy=public (flux game LoRAs).
// Costs CUs from awfml's Scenario account. Keys in /home/claudebot/.env.
import { writeFileSync, statSync } from 'fs';

const [prompt, outfile, modelId = 'flux.1-dev', size = '1024x1024'] = process.argv.slice(2);
if (!prompt || !outfile) {
  console.error('usage: node scenario-gen.mjs "<prompt>" <out.png> [modelId] [WxH]');
  process.exit(1);
}
import { loadKey } from './_env.mjs';
const KEY = loadKey('SCENARIO_API_KEY');
const SEC = loadKey('SCENARIO_API_SECRET');
const AUTH = 'Basic ' + Buffer.from(`${KEY}:${SEC}`).toString('base64');
const [w, h] = size.split('x').map(Number);
const API = 'https://api.cloud.scenario.com/v1';

const sub = await fetch(`${API}/generate/txt2img`, {
  method: 'POST',
  headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify({ modelId, prompt, width: w, height: h, numSamples: 1 }),
});
const subJ = await sub.json();
const jobId = subJ.job?.jobId;
if (!jobId) { console.error('SUBMIT FAILED:', JSON.stringify(subJ).slice(0, 300)); process.exit(2); }

let assetIds = [];
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 6000));
  const jr = await (await fetch(`${API}/jobs/${jobId}`, { headers: { Authorization: AUTH } })).json();
  const st = jr.job?.status;
  if (st === 'success') { assetIds = jr.job.metadata?.assetIds ?? []; break; }
  if (st === 'failure' || st === 'canceled') { console.error('JOB FAILED:', JSON.stringify(jr.job?.error ?? st).slice(0, 300)); process.exit(2); }
}
if (!assetIds.length) { console.error('TIMEOUT waiting for job', jobId); process.exit(2); }

const ar = await (await fetch(`${API}/assets/${assetIds[0]}`, { headers: { Authorization: AUTH } })).json();
const url = ar.asset?.url;
if (!url) { console.error('NO ASSET URL:', JSON.stringify(ar).slice(0, 300)); process.exit(2); }
const img = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync(outfile, img);
console.log(`OK ${outfile} (${statSync(outfile).size} bytes, model ${modelId})`);
