# Veloce Motor — Website Plan

Source: Proposal PRO-00272 (Yuiee Marketing Solutions, 23-10-2026), `About.txt`, logo, product labels.
Delivery target: **17 working days**.

---

## 1. What we're building

A fast, premium catalog + booking site for **Veloce Motor** (Angamaly, Kerala), a manufacturer of two-wheeler suspension systems with a growing car & bike care line (Hydrophobic Wash Shampoo, 200 ml / 500 ml).

All 14 scope items from the proposal are covered:

| # | Proposal item | How it's delivered |
|---|---|---|
| 1–2 | Modern, responsive design | Custom design system (chrome / graphite / electric blue), mobile-first |
| 3 | Product display | Static product pages, generated from Supabase at build time |
| 4 | Service listing | Static service pages with pricing |
| 5–6 | Online booking + form | `/book` form → Worker → Supabase, protected by Turnstile |
| 7 | Admin dashboard | `/admin` (Supabase Auth, admin role only) |
| 8 | Booking management | View / confirm / reschedule / cancel / complete, with notes |
| 9 | Product & service CRUD | Admin editors with image upload to R2 |
| 10 | Email notifications | Resend (free tier) sent from the Worker |
| 11 | WhatsApp | Floating `wa.me` button plus "Enquire on WhatsApp" on each product (pre-filled message) |
| 12 | Search & filter | Client-side search over a prebuilt JSON index, so it needs no API calls |
| 13 | Contact & enquiry forms | Same pipeline as bookings |
| 14 | SEO & security | Static HTML, JSON-LD, sitemap, RLS, Turnstile, security headers |

---

## 2. Architecture: static-first, zero-cost reads

The rule: **visitors never touch the database while they browse.** Only *writes* (a booking or an enquiry) and *admin work* reach Supabase.

```
                 ┌──────────── Build time (only when content changes) ───────────┐
 Admin saves ──► Worker ──► Pages Deploy Hook ──► Astro build reads Supabase once ─┘
                                                     │
                                                     ▼
 Visitor ──► Cloudflare Pages (static HTML/CSS/JS, edge-cached, free unlimited)
         ──► media.velocemotor.com (R2 public bucket via custom domain, edge-cached, zero egress)
         ──► POST /api/booking | /api/enquiry ──► Worker ──► Supabase (insert) + Resend (email)

 Admin ──► /admin (SPA island) ──► Supabase (RLS, admin only)
                               ──► Worker /api/admin/* (R2 uploads, status-change emails, rebuild)
```

### Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Astro** (static output) | Outputs HTML with no JS by default, so public pages ship almost no JavaScript |
| Interactive bits | **Preact** islands (search, booking form, admin) | About 4 KB, compared with about 45 KB for React |
| Styling | Plain CSS with design tokens (or Tailwind v4, purged) | No runtime cost |
| API | **Cloudflare Worker** with **Hono** (`/api/*` route on the same domain) | Same origin, so no CORS preflights and no extra requests |
| DB / Auth | **Supabase** (Postgres + Auth) | Used only for writes and admin |
| Media | **R2** with a custom domain | 10 GB free, no egress fees |
| Email | **Resend** (3,000/month, 100/day free) | Simple API with domain verification. Brevo (300/day) is a fallback |
| Spam | **Cloudflare Turnstile** | Free and invisible |

---

## 3. Free-tier budget and how we stay inside it

| Service | Free limit | Expected use | Strategy |
|---|---|---|---|
| CF Pages | Unlimited static requests, 500 builds/month | ~30–60 builds/month | Rebuild only on content change, debounced (see §6) |
| CF Workers | 100k requests/day, 10 ms CPU | Under 500/day (forms plus admin) | Public pages never call the Worker |
| R2 | 10 GB, 1M Class A, 10M Class B ops/month | Under 1 GB | Cache at the edge with `Cache-Control: public, max-age=31536000, immutable` and hashed filenames, so most hits never reach R2 |
| Supabase DB | 500 MB, 5 GB egress | A few MB | Only the build and admin read it; admin queries select specific columns and paginate |
| Supabase Auth | 50k MAU | 1–3 admins | Customers don't log in |
| Resend | 100/day | ~2 emails per booking | One customer email and one admin alert per booking |

**⚠ Supabase pauses free projects after 7 days of inactivity.** A Worker **Cron Trigger** runs once a day with a 1-row `select` to keep the project alive. It also produces a daily summary if wanted later.

---

## 4. Performance budget

- **LCP < 1.8 s** on mid-range Android over 4G, **CLS < 0.05**, Lighthouse **95+** on all four categories
- Public-page JavaScript **under 30 KB gzipped** (pages without search or booking ship 0 KB)
- Hero image in AVIF, **at most 120 KB**, preloaded, with `fetchpriority="high"`
- Fonts: 2 families, self-hosted, subset to Latin, woff2, `font-display: swap`, display weight preloaded
- **Images are resized in the browser at upload time**: the admin picks one photo, and canvas produces 3 widths (480 / 960 / 1600) in WebP plus a tiny blur placeholder, which are all saved to R2. No paid image-resizing service is needed and no runtime transforms run.
- Every `<img>` has `width`/`height`, `loading="lazy"`, and `srcset`
- Animations are CSS-only (transform/opacity) using an IntersectionObserver reveal. No GSAP or Three.js on public pages, and `prefers-reduced-motion` is respected.
- `_headers`: long cache for `/_astro/*` and media, short cache for HTML

---

## 5. Design direction: "Chrome & Carbon"

Taken from the logo (brushed-chrome winged V) and the existing packaging (black with electric-blue light streaks).

### Palette

| Token | Hex | Use |
|---|---|---|
| `--carbon-950` | `#0A0B0D` | Main dark background (hero, footer) |
| `--carbon-900` | `#121418` | Dark sections and cards |
| `--graphite-700` | `#2A2E35` | Borders on dark surfaces |
| `--steel-400` | `#8A9099` | Muted text on dark |
| `--chrome-200` | `#C9CDD2` | Chrome highlights and dividers |
| `--chrome-50` | `#F4F5F7` | Light section background |
| `--white` | `#FFFFFF` | Text on dark, cards on light |
| `--volt-500` | `#1E6FE8` | **Single accent**: CTAs, links, focus rings |
| `--volt-400` | `#4A8DF5` | Accent hover / on-dark variant |
| `--success / --warn / --danger` | `#1F9D61 / #D99A1E / #D64545` | Admin booking statuses only |

**Chrome gradient** (for headings and logo-like accents only, used sparingly):
`linear-gradient(180deg, #F4F5F7 0%, #B9BEC5 45%, #6E747C 55%, #D7DADF 100%)`

The rule: mostly **dark plus chrome**, with blue reserved for the one action you want the visitor to take. Alternating dark and light sections keep it premium without feeling heavy.

### Type

- **Display:** *Saira* (or *Rajdhani*), a wide, technical, automotive feel that suits the "VELOCE" wordmark; uppercase with tracking for section headings
- **Body / UI:** *Inter*

### Feel

Big product photography on dark backgrounds, thin chrome hairlines, generous whitespace, subtle blue light-streak motifs borrowed from the label (as SVG or CSS gradients, not images), and spec tables that read like engineering data sheets.

---

## 6. Content-change → rebuild flow (keeps API calls near zero)

1. The admin edits a product or service and clicks Save, which writes to Supabase directly under RLS.
2. The admin UI calls `POST /api/admin/publish`. The Worker verifies the admin JWT, then calls the **Pages Deploy Hook**.
3. **Debounce:** the Worker stores `last_publish_at` in the `settings` row and skips a hook if one fired in the last 2 minutes. The UI shows "Publishing… live in ~1 min". A manual **"Publish changes"** button is also available so an admin can batch several edits into one build.
4. The Astro build fetches all active products, services and vehicles **in about 4 queries**, generates the pages, `search-index.json` (under 20 KB) and `sitemap.xml`.

Data that must be live, such as **available booking slots**, comes from a small Worker endpoint `GET /api/slots?date=` that is cached at the edge for 60 s.

---

## 7. Data model (Supabase)

```sql
segments        (id, slug, name, sort)        -- Cruiser & Performance | Commuter | Scooter & EV | Car & Bike Care
vehicles        (id, brand, model, segment_id, slug)          -- RE Classic 350, KTM Duke, Splendor, Activa…
products        (id, slug, name, segment_id, kind,            -- kind: suspension | care
                 position,                                     -- front | rear | pair | null
                 short_desc, description, specs jsonb,         -- travel, spring rate, length, finish…
                 price, mrp, sku, images jsonb,                -- [{key, w, h, alt, blur}]
                 is_active, is_featured, sort, updated_at)
product_fitment (product_id, vehicle_id)                       -- powers "Find parts for your bike"
services        (id, slug, name, description, price_from, duration_min,
                 images jsonb, is_bookable, is_active, sort)
bookings        (id, ref text unique,                          -- e.g. VM-2611-0042
                 service_id, name, phone, email,
                 vehicle_text, preferred_date, slot,
                 notes, status, admin_note,                    -- pending|confirmed|rescheduled|completed|cancelled
                 created_at, updated_at)
enquiries       (id, name, phone, email, product_id null, message,
                 status, created_at)                           -- new|replied|closed
settings        (id=1, phone, whatsapp, email, address, hours jsonb,
                 slot_config jsonb, holidays date[], last_publish_at)
profiles        (id → auth.users, role)                        -- 'admin'
```

**RLS:**
- `anon` can `select` only active products, services, vehicles and segments (used by the build). It cannot read bookings, enquiries or profiles.
- `anon` **cannot insert**. All public writes go through the Worker, which verifies Turnstile, validates input with zod, then inserts using the service-role key, which is stored as a Worker secret.
- `authenticated` with `role = 'admin'` has full CRUD.
- Indexes: `bookings(status, preferred_date)`, `bookings(created_at desc)`, `products(segment_id, is_active)`.

---

## 8. Sitemap

### Public (static)

- **Home**: hero (chrome V on carbon, "Precision Engineering for Every Ride."), **"Find suspension for your bike"** selector (brand → model), the 3 segments, featured products, services, why Veloce (durability / comfort / built for Indian roads), care line strip, booking CTA, WhatsApp
- **Products** `/products`: filters for segment, brand/model, front/rear and price; instant search; product grid
- **Product detail** `/products/[slug]`: gallery, specs data-sheet, compatible vehicles, price, "Enquire on WhatsApp", "Book fitment"
- **Services** `/services` and `/services/[slug]`: details, price, duration, "Book now"
- **Book** `/book`: a 3-step form (service → date & slot → your details), with Turnstile and a reference number on success
- **About** `/about`: story, manufacturing, product range (from `About.txt`)
- **Contact** `/contact`: enquiry form, map (static image linking to Google Maps, so no heavy embed), phone, WhatsApp, hours
- `/privacy`, `/terms`, `404`

### Admin `/admin` (noindex, client-rendered)

- Login (Supabase email + password, with password reset)
- Dashboard: today's and upcoming bookings, new enquiries, counts by status
- Bookings: list with filters (status, date) and a detail drawer to confirm, reschedule, cancel or complete, which sends the matching email
- Enquiries: list, mark replied, one-tap WhatsApp or call
- Products / Services / Vehicles: CRUD, drag-to-sort, image uploader (resize in browser, then R2)
- Settings: contact info, hours, slot rules, holidays
- **Publish changes** button showing the last-published time

---

## 9. Worker API

| Method | Route | Auth | Does |
|---|---|---|---|
| POST | `/api/booking` | Turnstile | Validates, checks slot capacity, inserts, emails customer and admin, returns ref |
| POST | `/api/enquiry` | Turnstile | Validates, inserts, emails admin |
| GET | `/api/slots?service&date` | public, edge-cached 60 s | Returns remaining slots |
| POST | `/api/admin/upload` | admin JWT | Streams the file to R2 via binding, returns key |
| DELETE | `/api/admin/media/:key` | admin JWT | Removes orphaned images |
| POST | `/api/admin/booking/:id/status` | admin JWT | Updates status and sends the status email |
| POST | `/api/admin/publish` | admin JWT | Debounced Pages deploy hook |
| cron | daily | none | Supabase keep-alive, plus optional daily summary email |

The Worker verifies JWTs with Supabase's JWKS (cached), so verification costs no extra Supabase call.

---

## 10. SEO and security

- **SEO:** per-page title and description, OG and Twitter images (generated once at build), canonical URLs, `sitemap.xml`, `robots.txt`, JSON-LD (`AutoPartsStore` / `LocalBusiness` with address and hours, `Product` with offers, `BreadcrumbList`), clean slugs, alt text required in the admin uploader, and landing copy targeting "bike suspension Kerala / Angamaly" and "Royal Enfield / Activa shock absorber"
- **Security:** RLS on every table, service key only inside the Worker, Turnstile on all public forms, zod validation, a free Cloudflare rate-limit rule on `/api/*`, and `_headers` with CSP, HSTS, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. The admin area is `noindex`, and **only invited admins can sign in** because public signups are disabled.

---

## 11. Project structure

```
veloce-motor/
├─ apps/web/            # Astro site (public + /admin)
│  ├─ src/pages/        # routes
│  ├─ src/components/   # .astro (static) + .tsx Preact islands
│  ├─ src/styles/tokens.css
│  └─ public/_headers, robots.txt, fonts/
├─ apps/api/            # Cloudflare Worker (Hono) + wrangler.toml (R2 binding, cron, secrets)
├─ supabase/migrations/ # schema, RLS, seed (segments, vehicles from About.txt)
└─ packages/shared/     # zod schemas + types shared by web & api
```

---

## 12. Timeline (17 working days)

| Days | Milestone |
|---|---|
| 1–2 | Supabase schema, RLS and seed; Worker skeleton; Pages and R2 setup; design tokens and type |
| 3–5 | Design and build of the Home, Products, Product detail, About and Contact pages |
| 6–7 | Services, booking flow, slots endpoint, Turnstile, emails |
| 8–11 | Admin: auth, dashboard, bookings, enquiries, product/service/vehicle CRUD, uploader, publish |
| 12–13 | Search and filter index, fitment finder, WhatsApp, SEO (JSON-LD, sitemap, OG) |
| 14–15 | Content entry (products, AI sample images), performance pass (Lighthouse, image audit) |
| 16 | QA: devices, email deliverability, RLS penetration checks, cron |
| 17 | Domain connection (`velocemotor.com`), go-live, admin handover |

---

## 13. Decisions (confirmed 2026-11-26)

1. **Bookable services:** Suspension fitting, Suspension servicing, Inspection / check-up, and Washing / detailing. These are seeded as 4 `services` rows, each with a price, duration and description that the admin can edit.
2. **Booking slots:** fixed time slots. `settings.slot_config` holds the default of 4 slots a day (10:00, 12:00, 14:00, 16:00) with capacity 2 per slot, and the admin can edit both. Holidays and Sundays are blocked. Full slots are hidden by `/api/slots`, and the booking Worker re-checks capacity before inserting so two customers can't overbook a slot.
3. **Prices:** MRP is shown for every product. `price` and `mrp` are required fields, and a strike-through MRP appears when the price is lower.
4. **Car & Bike Care:** this is its own segment and category. It's seeded with the Hydrophobic Car & Bike Wash Shampoo in 200 ml (₹249) and 500 ml (MRP to be confirmed).
5. **Payment:** customers pay at the workshop, so there is no payment gateway.
6. **Photos:** we generate **sample product images** (AI renders of chrome/black suspensions on dark studio backgrounds, matching the brand) for launch. Each is tagged `is_sample` in `images`, so the admin dashboard can list which ones still need replacing with real photos.
7. **Email:** the business inbox is `velocemotor.com@gmail.com`.
   - Admin alerts (new booking or enquiry) go **to** this Gmail address.
   - Customer emails cannot be sent *from* a @gmail.com address through Resend or any other transactional service, because Gmail's anti-spoofing checks fail and the mail lands in spam. So customer emails are sent **from** `Veloce Motor <noreply@velocemotor.com>` with **Reply-To `velocemotor.com@gmail.com`**, which means customer replies still arrive in Gmail.
   - This needs a one-time DNS verification of `velocemotor.com` in Resend (3 records). Until the domain is live, Resend's test sender is used in development.
8. The unfinished "Use …" line was a typo and is ignored.
