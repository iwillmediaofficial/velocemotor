// Supabase pauses free-tier projects after 7 days without activity.
// This Worker runs once a day (Cron Trigger) and makes one tiny read so the project stays awake.
interface Env { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string }

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      fetch(`${env.SUPABASE_URL}/rest/v1/settings?select=id&limit=1`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY } })
        .then((r) => console.log('keepalive', r.status))
        .catch((e) => console.error('keepalive failed', e)),
    );
  },
} satisfies ExportedHandler<Env>;
