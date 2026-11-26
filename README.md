# Veloce Motor — website

Catalogue, online booking and admin dashboard for Veloce Motor (Angamaly, Kerala).

**Stack (all free tier):** Astro (static) + Preact islands · Cloudflare Pages + Pages Functions (`/api/*`) · Supabase (Postgres + Auth) · Cloudflare R2 (product photos) · Cloudflare Turnstile (spam) · Resend (email).

## How it stays fast and free

- **Visitors never hit the database while browsing.** Every page is pre-built from Supabase at build time (5 queries per build).
- Search and filters run in the browser over data embedded in the page.
- Only **bookings, enquiries, the slot calendar and admin actions** call `/api/*` (Pages Functions → Supabase).
- `GET /api/slots` is cached at the edge for 60 s. `create_booking` re-checks capacity inside a locked transaction, so a slot can never be double-booked.
- Admin edits are saved to Supabase immediately. The public site updates when the admin clicks **Publish changes**, which triggers a Pages rebuild, at most once every 2 minutes.
- Product photos are resized **in the admin's browser** to 480/960/1600 px WebP and stored in R2. R2 has no egress fees, and there is no paid image service.
- `workers/keepalive` pings Supabase daily, because free projects pause after 7 days with no activity.

## Project layout

```
src/pages/            public pages + /admin
src/islands/          interactive Preact parts (product browser, booking, enquiry, admin app)
src/lib/              catalogue fetch (build time), shared zod schemas, formatting, placeholder art
functions/api/        Pages Function: /api/slots, /api/booking, /api/enquiry, /api/admin/*
functions/media/      fallback image server for /media/* (dev / before the R2 custom domain exists)
supabase/migrations/  schema + RLS, booking functions, seed data
workers/keepalive/    daily cron Worker
```

## Local development

```bash
npm install
cp .env.example .env            # public values (Supabase URL + publishable key, Turnstile test key)
cp .dev.vars.example .dev.vars  # secrets for the API: paste the Supabase SECRET key
npm run build && npm run dev:api   # full site + API on http://localhost:8788
# or, for live-reload of pages:  npm run dev  (:4321, proxies /api to :8788 — keep dev:api running)
```

## Go-live checklist

### Supabase (project `ezynivufmaeftqymvawu`)
1. Migrations in `supabase/migrations` are **already applied**.
2. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up".
3. Go to **Authentication → Users → Add user** and create the admin login (email + password). Then make that user an admin in the SQL editor:
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
   where email = 'ADMIN_EMAIL_HERE';
   ```
   The admin then signs out and back in to pick up the role.
4. Go to **Project Settings → API Keys** and copy the **secret** key into Cloudflare as `SUPABASE_SERVICE_ROLE_KEY`. It must never go in the browser or in git.
5. Go to **Authentication → URL Configuration** and set Site URL to `https://velocemotor.com`. Add `https://velocemotor.com/admin` to the redirect URLs for password resets.

### Cloudflare
1. **Pages:** create a project, connect this GitHub repo, set the build command to `npm run build` and the output to `dist`.
   - Under Environment variables, add every `PUBLIC_*` variable from `.env.example`.
   - Under Secrets, add `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET`, `RESEND_API_KEY` and `PAGES_DEPLOY_HOOK`.
2. **R2:** create the bucket `velocemotor-media` and bind it to the Pages project as `MEDIA` (already in `wrangler.toml`).
   - Connect a custom domain such as `media.velocemotor.com`.
   - Set `PUBLIC_MEDIA_URL=https://media.velocemotor.com`.
3. **Turnstile:** add a widget for `velocemotor.com`, then set `PUBLIC_TURNSTILE_SITE_KEY` and the `TURNSTILE_SECRET` secret.
4. **Deploy hook:** go to Pages → Settings → Builds → Deploy hooks, create one and save its URL as the `PAGES_DEPLOY_HOOK` secret.
5. **Custom domain:** add `velocemotor.com` to the Pages project.
6. **Rate limiting** (free plan: 1 rule): Security → WAF → Rate limiting. Use path starts with `/api/`, 20 requests per 10 s per IP, then block.
7. **Keep-alive:** run `npm run deploy:keepalive`.

### Resend (email)
1. Add the domain `velocemotor.com` and create the 3 DNS records Resend shows (in Cloudflare DNS).
2. Create an API key and set it as the `RESEND_API_KEY` secret.
3. Customer emails come from `noreply@velocemotor.com`, and replies go to `velocemotor.com@gmail.com` (see `wrangler.toml`).

## Quick local test (Windows)

Double-click `run-local.cmd` (or run `npm run local`), then open http://localhost:8788.
Bookings, enquiries and admin actions need `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars`.
