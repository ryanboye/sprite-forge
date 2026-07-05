// Robust API-key loading: env var first, then ~/.env, else a CLEAR error.
// (Avoids the footgun where a paren-less `.match(...)[1]` throws when a key is
// only partially present or ~/.env is missing.)
import { readFileSync } from 'fs';

export function loadKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const m = readFileSync(process.env.HOME + '/.env', 'utf8')
      .match(new RegExp('^' + name + '=(.*)$', 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* no ~/.env — fall through to the clear error */ }
  throw new Error(`Missing ${name} — set it as an env var or add "${name}=..." to ~/.env`);
}
