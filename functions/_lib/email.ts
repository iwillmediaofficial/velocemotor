// Transactional email via Resend's HTTP API. Failures are logged, never shown to the customer.
import type { Env } from './env';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function sendEmail(env: Env, to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email skipped: RESEND_API_KEY not set] to=${to} subject="${subject}"`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, reply_to: replyTo ?? env.REPLY_TO }),
  });
  if (!res.ok) console.error('Resend error', res.status, await res.text());
}

const fmtDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

function layout(env: Env, title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1d22">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0A0B0D;padding:20px 24px"><img src="${env.SITE_URL}/assets/veloce-logo-email.png" alt="Veloce" height="40" style="height:40px"></td></tr>
<tr><td style="padding:28px 24px"><h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>${body}</td></tr>
<tr><td style="padding:16px 24px;background:#f4f5f7;font-size:12px;color:#5d636c">Veloce Motor · Peechanikkad, Angamaly, Kerala 683572 · <a href="${env.SITE_URL}" style="color:#1E6FE8">${env.SITE_URL.replace(/^https?:\/\//, '')}</a></td></tr>
</table></td></tr></table></body></html>`;
}

const row = (k: string, v: unknown) =>
  `<tr><td style="padding:6px 12px 6px 0;color:#5d636c;font-size:14px;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-size:14px"><b>${esc(v)}</b></td></tr>`;

export interface BookingRow {
  id: string; ref: string; name: string; phone: string; email: string | null; vehicle: string;
  booking_date: string; slot: string; notes: string | null; status: string; service_id: string;
}

export function bookingDetails(b: BookingRow, serviceName: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0">${row('Reference', b.ref)}${row('Service', serviceName)}${row('Date', fmtDate(b.booking_date))}${row('Time', fmtTime(b.slot))}${row('Vehicle', b.vehicle)}</table>`;
}

export function customerBookingEmail(env: Env, b: BookingRow, serviceName: string) {
  const subject = `Booking received: ${serviceName} on ${fmtDate(b.booking_date)} (${b.ref})`;
  const html = layout(env, `Thanks, ${b.name.split(' ')[0]}! We've received your booking.`,
    `<p style="font-size:15px;line-height:1.6">Our team will confirm your slot shortly. Payment is made at the workshop.</p>${bookingDetails(b, serviceName)}
     <p style="font-size:14px;line-height:1.6;margin-top:20px">Need to change something? Just reply to this email or WhatsApp us.</p>`);
  return { subject, html };
}

export function adminBookingEmail(env: Env, b: BookingRow, serviceName: string) {
  const subject = `New booking ${b.ref}: ${serviceName}, ${fmtDate(b.booking_date)} ${fmtTime(b.slot)}`;
  const html = layout(env, 'New booking',
    `${bookingDetails(b, serviceName)}<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px">${row('Customer', b.name)}${row('Phone', b.phone)}${row('Email', b.email ?? '—')}${row('Notes', b.notes ?? '—')}</table>
     <p style="margin-top:20px"><a href="${env.SITE_URL}/admin#/bookings" style="background:#1E6FE8;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-size:14px">Open in admin</a></p>`);
  return { subject, html };
}

const STATUS_TEXT: Record<string, string> = {
  confirmed: 'Your booking is confirmed. See you at the workshop!',
  rescheduled: 'Your booking has been moved to a new time.',
  completed: 'Your service is complete. Thank you for choosing Veloce Motor!',
  cancelled: 'Your booking has been cancelled. If this is unexpected, please contact us.',
};

export function statusEmail(env: Env, b: BookingRow, serviceName: string) {
  const title = { confirmed: 'Booking confirmed', rescheduled: 'Booking rescheduled', completed: 'Service completed', cancelled: 'Booking cancelled' }[b.status] ?? 'Booking update';
  const subject = `${title}: ${b.ref}`;
  const html = layout(env, title, `<p style="font-size:15px;line-height:1.6">${esc(STATUS_TEXT[b.status] ?? '')}</p>${bookingDetails(b, serviceName)}`);
  return { subject, html };
}

export function adminEnquiryEmail(env: Env, e: { name: string; phone: string; email: string | null; message: string }, productName: string | null) {
  const subject = `New enquiry from ${e.name}${productName ? ` about ${productName}` : ''}`;
  const html = layout(env, 'New enquiry',
    `<table role="presentation" cellpadding="0" cellspacing="0">${row('Name', e.name)}${row('Phone', e.phone)}${row('Email', e.email ?? '—')}${row('Product', productName ?? 'General')}</table>
     <p style="font-size:15px;line-height:1.6;white-space:pre-wrap;background:#f4f5f7;padding:12px;border-radius:8px">${esc(e.message)}</p>
     <p><a href="https://wa.me/91${esc(e.phone)}" style="color:#1FAF5A">Reply on WhatsApp</a></p>`);
  return { subject, html };
}
