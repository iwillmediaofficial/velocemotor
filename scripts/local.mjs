// Local test server: builds the site, serves it with the API on http://localhost:8788 (Wrangler),
// and rebuilds automatically when the admin changes products/services/etc. — the local stand-in
// for the Cloudflare deploy hook used in production.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^\s*[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const node = process.execPath;
const astroBin = join(root, 'node_modules', 'astro', 'bin', 'astro.mjs');
const wranglerBin = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const log = (...a) => console.log('[local]', ...a);

function build() {
  const t = Date.now();
  const r = spawnSync(node, [astroBin, 'build', '--silent'], { cwd: root, stdio: 'inherit' });
  if (r.status === 0) log(`site rebuilt in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  else log('build failed (see errors above)');
  return r.status === 0;
}

async function contentVersion() {
  const res = await fetch(`${env.PUBLIC_SUPABASE_URL}/rest/v1/settings?select=content_updated_at&id=eq.1`, {
    headers: { apikey: env.PUBLIC_SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`settings ${res.status}`);
  return (await res.json())[0]?.content_updated_at ?? '';
}

let seen = await contentVersion().catch(() => '');
if (!build()) process.exit(1);

const server = spawn(node, [wranglerBin, 'pages', 'dev', 'dist', '--port', '8788'], { cwd: root, stdio: 'inherit' });
const stop = () => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));

// Poll the content version (one tiny read every 5 s) and rebuild after the admin stops editing.
let pendingSince = 0;
setInterval(async () => {
  try {
    const v = await contentVersion();
    if (v && v !== seen) { seen = v; pendingSince = Date.now(); log('content changed, rebuilding shortly…'); }
    if (pendingSince && Date.now() - pendingSince >= 4000) { pendingSince = 0; build(); }
  } catch { /* offline: try again next tick */ }
}, 5000);
