// Scheduled Worker (every 10 minutes):
//  1. Keeps the free Supabase project awake (free projects pause after 7 days without activity).
//  2. Safety net for automatic publishing: if catalogue content changed after the last site rebuild
//     (e.g. the admin closed the tab before the dashboard triggered it), trigger the Pages deploy hook.
interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string; // secret
  PAGES_DEPLOY_HOOK?: string;         // secret
}

const MIN_GAP_MS = 120_000;   // never rebuild more than once per 2 minutes
const SETTLE_MS = 60_000;     // wait until the admin has stopped editing for a minute

async function run(env: Env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/settings?select=content_updated_at,last_publish_at&id=eq.1`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!res.ok) { console.error('settings read failed', res.status); return; }
  const [s] = (await res.json()) as { content_updated_at: string; last_publish_at: string | null }[];
  if (!s || !env.PAGES_DEPLOY_HOOK || !env.SUPABASE_SERVICE_ROLE_KEY) return;

  const changed = Date.parse(s.content_updated_at);
  const published = s.last_publish_at ? Date.parse(s.last_publish_at) : 0;
  const now = Date.now();
  if (changed <= published || now - published < MIN_GAP_MS || now - changed < SETTLE_MS) return;

  const hook = await fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' });
  if (!hook.ok) { console.error('deploy hook failed', hook.status); return; }

  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  await fetch(`${env.SUPABASE_URL}/rest/v1/settings?id=eq.1`, {
    method: 'PATCH', headers, body: JSON.stringify({ last_publish_at: new Date(now).toISOString() }),
  });
  console.log('auto-published pending changes');
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env).catch((e) => console.error('cron failed', e)));
  },
} satisfies ExportedHandler<Env>;
