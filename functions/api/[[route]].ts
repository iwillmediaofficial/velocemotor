// All /api/* routes (Cloudflare Pages Function). Static pages never invoke this, so Worker usage stays tiny.
import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import type { Env, AppVars } from '../_lib/env';
import { DbError, insert, rpc, select, update } from '../_lib/supabase';
import { verifyTurnstile } from '../_lib/turnstile';
import { verifyAdmin } from '../_lib/auth';
import {
  adminBookingEmail, adminEnquiryEmail, customerBookingEmail, sendEmail, statusEmail, type BookingRow,
} from '../_lib/email';
import { adminBookingUpdateSchema, adminCreateBookingSchema, bookingSchema, enquirySchema, fieldErrors } from '../../src/lib/schemas';

const app = new Hono<{ Bindings: Env; Variables: AppVars }>().basePath('/api');

const MESSAGES: Record<string, [number, string]> = {
  SLOT_FULL: [409, 'Sorry, that time slot was just taken. Please pick another.'],
  TOO_LATE: [409, 'That time is too soon to book online. Please pick a later slot.'],
  CLOSED: [409, "We're closed on that day. Please pick another date."],
  INVALID_SLOT: [400, 'That time slot is not available. Please pick another.'],
  DATE_OUT_OF_RANGE: [400, 'Please pick a date within the booking window.'],
  INVALID_SERVICE: [400, 'That service is not available for online booking.'],
  INVALID_VEHICLE_TYPE: [400, 'Please choose your vehicle type.'],
  SERVICE_NOT_FOR_VEHICLE: [400, 'That service is not available for your vehicle type. Please choose another service.'],
  NOT_FOUND: [404, 'Booking not found.'],
};

/** Map DB function errors (raise exception 'SLOT_FULL' …) to friendly responses. */
function dbErrorResponse(e: unknown) {
  if (e instanceof DbError) {
    const known = MESSAGES[e.message];
    if (known) return Response.json({ error: e.message, message: known[1] }, { status: known[0] });
    console.error('DB error', e.status, e.code, e.message);
  } else {
    console.error(e);
  }
  return Response.json({ error: 'SERVER', message: 'Something went wrong on our side. Please try again or contact us on WhatsApp.' }, { status: 500 });
}

app.onError((err) => dbErrorResponse(err));

// Clear setup error instead of a generic 500 when the server secret is missing (e.g. empty .dev.vars locally).
app.use('*', async (c, next) => {
  if (!c.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set (.dev.vars locally, or a Cloudflare Pages secret)');
    return c.json({ error: 'NOT_CONFIGURED', message: 'Server setup incomplete: SUPABASE_SERVICE_ROLE_KEY is missing. Add your Supabase secret key to .dev.vars and restart.' }, 503);
  }
  await next();
});

/* ------------------------------------------------------------------ public */

// Availability for the booking calendar. Edge-cached for 60 s; create_booking re-checks capacity anyway.
app.get('/slots', async (c) => {
  const cache = caches.default;
  const key = new Request(new URL('/api/slots', c.req.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;

  const rows = await rpc<{ day: string; slot: string; remaining: number; available: boolean; reason: string | null }[]>(c.env, 'slot_availability');
  const byDay = new Map<string, { slot: string; remaining: number; available: boolean; reason: string | null }[]>();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day)!.push({ slot: r.slot, remaining: r.remaining, available: r.available, reason: r.reason });
  }
  const res = Response.json(
    { days: [...byDay].map(([date, slots]) => ({ date, slots })) },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
  c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
});

app.post('/booking', async (c) => {
  const parsed = bookingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'VALIDATION', message: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) }, 400);
  const d = parsed.data;

  if (!(await verifyTurnstile(c.env, d.token, c.req.header('CF-Connecting-IP') ?? null))) {
    return c.json({ error: 'BOT_CHECK', message: 'Verification failed. Please refresh the page and try again.' }, 403);
  }

  const b = await rpc<BookingRow>(c.env, 'create_booking', {
    p_service: d.service, p_product: d.product ?? null, p_name: d.name, p_phone: d.phone, p_email: d.email,
    p_vehicle: d.vehicle, p_date: d.date, p_slot: d.slot, p_notes: d.notes, p_vehicle_type: d.vehicle_type,
  });

  // invalidate cached availability so the next visitor sees the slot count drop
  c.executionCtx.waitUntil(caches.default.delete(new Request(new URL('/api/slots', c.req.url).toString())));

  c.executionCtx.waitUntil((async () => {
    const [svc] = await select<{ name: string }[]>(c.env, `services?select=name&id=eq.${encodeURIComponent(b.service_id)}`);
    const name = svc?.name ?? b.service_id;
    const toAdmin = adminBookingEmail(c.env, b, name);
    const jobs = [sendEmail(c.env, c.env.ADMIN_EMAIL, toAdmin.subject, toAdmin.html, b.email ?? undefined)];
    if (b.email) {
      const toCustomer = customerBookingEmail(c.env, b, name);
      jobs.push(sendEmail(c.env, b.email, toCustomer.subject, toCustomer.html));
    }
    await Promise.allSettled(jobs);
  })());

  return c.json({ ref: b.ref }, 201);
});

app.post('/enquiry', async (c) => {
  const parsed = enquirySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'VALIDATION', message: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) }, 400);
  const d = parsed.data;

  if (!(await verifyTurnstile(c.env, d.token, c.req.header('CF-Connecting-IP') ?? null))) {
    return c.json({ error: 'BOT_CHECK', message: 'Verification failed. Please refresh the page and try again.' }, 403);
  }

  const row = await insert<{ id: string; product_id: string | null }>(c.env, 'enquiries', {
    name: d.name, phone: d.phone, email: d.email || null, product_id: d.product || null, message: d.message,
  });

  c.executionCtx.waitUntil((async () => {
    let productName: string | null = null;
    if (row.product_id) {
      const [p] = await select<{ name: string }[]>(c.env, `products?select=name&id=eq.${row.product_id}`);
      productName = p?.name ?? null;
    }
    const { subject, html } = adminEnquiryEmail(c.env, { name: d.name, phone: d.phone, email: d.email || null, message: d.message }, productName);
    await sendEmail(c.env, c.env.ADMIN_EMAIL, subject, html, d.email || undefined);
  })());

  return c.json({ ok: true }, 201);
});

/* ------------------------------------------------------------------ admin */

const admin = new Hono<{ Bindings: Env; Variables: AppVars }>();

admin.use('*', async (c, next) => {
  const user = await verifyAdmin(c.env, c.req.header('Authorization'));
  if (!user) return c.json({ error: 'UNAUTHORIZED', message: 'Please sign in as an admin.' }, 401);
  c.set('adminEmail', user.email);
  await next();
});

// Create a booking taken by phone / walk-in / WhatsApp. Uses the same slots and capacity as online bookings.
admin.post('/bookings', async (c) => {
  const parsed = adminCreateBookingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'VALIDATION', message: 'Please check the highlighted fields.', fields: fieldErrors(parsed.error) }, 400);
  const d = parsed.data;

  let b: BookingRow;
  try {
    b = await rpc<BookingRow>(c.env, 'admin_create_booking', {
      p_service: d.service, p_vehicle_type: d.vehicle_type, p_vehicle: d.vehicle, p_name: d.name, p_phone: d.phone,
      p_email: d.email, p_date: d.date, p_slot: d.slot, p_notes: d.notes, p_admin_note: d.admin_note,
      p_status: d.status, p_price: d.price ?? null, p_source: d.source,
    });
  } catch (e) {
    const known: Record<string, [number, string]> = {
      SLOT_FULL: [409, 'That time is already full with confirmed bookings. Pick another time, or save it as a pending request.'],
      CLOSED: [409, 'The workshop is closed on that day (see Settings).'],
      DATE_IN_PAST: [400, 'That date is in the past.'],
      SERVICE_NOT_FOR_VEHICLE: [400, 'That service is not offered for this vehicle type (see Services).'],
      INVALID_SLOT: [400, 'That time is not one of the booking slots (see Settings).'],
    };
    if (e instanceof DbError && known[e.message]) {
      const [status, message] = known[e.message];
      return c.json({ error: e.message, message }, status as 400 | 409);
    }
    throw e;
  }

  c.executionCtx.waitUntil(caches.default.delete(new Request(new URL('/api/slots', c.req.url).toString())));

  let emailed = false;
  if (d.notify && b.email) {
    const [svc] = await select<{ name: string }[]>(c.env, `services?select=name&id=eq.${encodeURIComponent(b.service_id)}`);
    const name = svc?.name ?? b.service_id;
    const mail = b.status === 'confirmed' ? statusEmail(c.env, b, name) : customerBookingEmail(c.env, b, name);
    c.executionCtx.waitUntil(sendEmail(c.env, b.email, mail.subject, mail.html));
    emailed = true;
  }
  return c.json({ booking: b, emailed }, 201);
});

// Update status / note / date+slot; emails the customer when the status changes.
admin.post('/bookings/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'NOT_FOUND', message: 'Booking not found.' }, 404);
  const parsed = adminBookingUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'VALIDATION', message: 'Invalid update.', fields: fieldErrors(parsed.error) }, 400);
  const d = parsed.data;

  const [before] = await select<BookingRow[]>(c.env, `bookings?select=status,booking_date,slot&id=eq.${id}`);
  if (!before) return c.json({ error: 'NOT_FOUND', message: 'Booking not found.' }, 404);

  let b: BookingRow;
  try {
    b = await rpc<BookingRow>(c.env, 'admin_update_booking', {
      p_id: id, p_status: d.status ?? null, p_note: d.admin_note ?? null, p_date: d.date ?? null, p_slot: d.slot ?? null,
    });
  } catch (e) {
    if (e instanceof DbError && e.message === 'SLOT_FULL') {
      return c.json({ error: 'SLOT_FULL', message: 'That time is already full with confirmed bookings. Pick another time, or decline this request.' }, 409);
    }
    if (e instanceof DbError && e.message === 'CLOSED') {
      return c.json({ error: 'CLOSED', message: 'The workshop is closed on that day (see Settings). Pick another date.' }, 409);
    }
    throw e;
  }

  c.executionCtx.waitUntil(caches.default.delete(new Request(new URL('/api/slots', c.req.url).toString())));

  const changed = b.status !== before.status || b.booking_date !== before.booking_date || b.slot !== before.slot;
  let emailed = false;
  if (d.notify && changed && b.email && ['confirmed', 'rescheduled', 'completed', 'cancelled'].includes(b.status)) {
    const [svc] = await select<{ name: string }[]>(c.env, `services?select=name&id=eq.${encodeURIComponent(b.service_id)}`);
    const { subject, html } = statusEmail(c.env, b, svc?.name ?? b.service_id);
    c.executionCtx.waitUntil(sendEmail(c.env, b.email, subject, html));
    emailed = true;
  }
  return c.json({ booking: b, emailed });
});

const WIDTHS = [480, 960, 1600] as const;
const MAX_BYTES = 3 * 1024 * 1024;

// Upload one product image: the browser has already resized it to 3 WebP widths.
admin.post('/upload', async (c) => {
  const form = await c.req.formData();
  const id = crypto.randomUUID();
  const files = WIDTHS.map((w) => form.get(`w${w}`));
  for (const f of files) {
    if (!(f instanceof File) || f.type !== 'image/webp' || f.size > MAX_BYTES) {
      return c.json({ error: 'VALIDATION', message: 'Each image variant must be a WebP under 3 MB.' }, 400);
    }
  }
  await Promise.all(files.map((f, i) =>
    c.env.MEDIA.put(`products/${id}-${WIDTHS[i]}.webp`, (f as File).stream(), {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
    }),
  ));
  return c.json({ id }, 201);
});

admin.delete('/media/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'VALIDATION', message: 'Bad id' }, 400);
  await c.env.MEDIA.delete(WIDTHS.map((w) => `products/${id}-${w}.webp`));
  return c.json({ ok: true });
});

// Rebuild the static site (Cloudflare Pages deploy hook), at most once every 2 minutes.
admin.post('/publish', async (c) => {
  if (!c.env.PAGES_DEPLOY_HOOK) return c.json({ error: 'NOT_CONFIGURED', message: 'Publishing is not set up yet (PAGES_DEPLOY_HOOK is missing).' }, 503);
  const [s] = await select<{ last_publish_at: string | null }[]>(c.env, 'settings?select=last_publish_at&id=eq.1');
  const last = s?.last_publish_at ? Date.parse(s.last_publish_at) : 0;
  const wait = 120_000 - (Date.now() - last);
  if (wait > 0) return c.json({ error: 'TOO_SOON', message: `A publish is already in progress. Try again in ${Math.ceil(wait / 1000)} s.`, retryAfter: Math.ceil(wait / 1000) }, 429);

  const hook = await fetch(c.env.PAGES_DEPLOY_HOOK, { method: 'POST' });
  if (!hook.ok) return c.json({ error: 'HOOK_FAILED', message: `Cloudflare did not accept the publish request (${hook.status}).` }, 502);
  const now = new Date().toISOString();
  await update(c.env, 'settings?id=eq.1', { last_publish_at: now });
  return c.json({ ok: true, last_publish_at: now });
});

app.route('/admin', admin);
app.notFound((c) => c.json({ error: 'NOT_FOUND', message: 'Not found' }, 404));

export const onRequest = handle(app);
