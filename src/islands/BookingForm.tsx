// 3-step booking: service → date & slot → details. One GET /api/slots, one POST /api/booking.
import { useEffect, useState } from 'preact/hooks';
import type { Service } from '../lib/types';
import { bookingSchema, fieldErrors, VEHICLE_TYPES, type VehicleType } from '../lib/schemas';
import { api, type ApiError } from '../lib/api';
import { fmtDate, fmtTime, inr, waLink } from '../lib/format';
import { icons } from '../lib/icons';
import Turnstile from './Turnstile';

interface SlotInfo { slot: string; remaining: number; available: boolean; reason: 'closed' | 'past' | 'full' | null }
interface Day { date: string; slots: SlotInfo[] }
interface Props { services: Service[]; products: { id: string; slug: string; name: string }[]; vehicles: { label: string; seg: string | null }[]; whatsapp: string }

// which catalogue segments to suggest models from for each vehicle type
const TYPE_SEGMENTS: Record<VehicleType, string[]> = { bike: ['cruiser', 'commuter'], scooter: ['scooter'], ev: ['scooter'], car: [] };
const TYPE_PLACEHOLDER: Record<VehicleType, string> = {
  bike: 'e.g. Royal Enfield Classic 350', scooter: 'e.g. Honda Activa 6G', ev: 'e.g. Ather 450X', car: 'e.g. Maruti Swift',
};

export default function BookingForm({ services, products, vehicles, whatsapp }: Props) {
  const [step, setStep] = useState(1);
  const [service, setService] = useState('');
  const [productSlug, setProductSlug] = useState('');
  const [days, setDays] = useState<Day[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', vehicle_type: '', vehicle: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string } | null>(null);
  const [notice, setNotice] = useState('');

  const loadSlots = () => {
    setLoadErr('');
    api<{ days: Day[] }>('/api/slots').then((r) => setDays(r.days)).catch((e: ApiError) => setLoadErr(e.message));
  };

  useEffect(() => {
    const u = new URLSearchParams(location.search);
    const s = u.get('service');
    if (s && services.some((x) => x.id === s)) { setService(s); setStep(2); }
    const p = u.get('product');
    if (p && products.some((x) => x.slug === p)) setProductSlug(p);
    loadSlots();
  }, []);

  const svc = services.find((s) => s.id === service);
  const product = products.find((p) => p.slug === productSlug);
  const day = days?.find((d) => d.date === date);

  const goto = (n: number) => {
    if (n >= 2 && !service) return setNotice('Please choose a service.');
    if (n >= 3 && (!date || !slot)) return setNotice('Please pick a date and time.');
    setNotice('');
    setStep(n);
    document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const payload = { service, product: product?.id ?? null, date, slot, token, ...form };
    const parsed = bookingSchema.safeParse(payload);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    if (!token) { setNotice('Please wait a moment while we verify you are human, then try again.'); return; }
    setErrors({}); setNotice(''); setBusy(true);
    try {
      const r = await api<{ ref: string }>('/api/booking', { method: 'POST', json: parsed.data });
      setDone(r);
      document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      const e2 = err as ApiError;
      setResetKey((k) => k + 1);
      if (e2.fields) setErrors(e2.fields);
      if (['SLOT_FULL', 'TOO_LATE', 'CLOSED', 'INVALID_SLOT', 'DATE_OUT_OF_RANGE'].includes(e2.error)) {
        setSlot(''); setStep(2); loadSlots();
      }
      setNotice(e2.message);
    } finally { setBusy(false); }
  };

  const field = (k: keyof typeof form) => ({
    id: `b-${k}`, name: k, class: 'input', value: form[k], 'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? `b-${k}-err` : undefined,
    onInput: (e: Event) => { const value = (e.currentTarget as HTMLInputElement).value; setForm((f) => ({ ...f, [k]: value })); },
  });
  const Err = ({ k }: { k: string }) => <span class="err-msg" id={`b-${k}-err`}>{errors[k] ?? ''}</span>;

  const summary = (
    <aside class="summary" aria-label="Booking summary">
      <span class="eyebrow">Summary</span>
      <h2 style="margin-top:8px;color:#fff;font-size:1.25rem">{svc ? svc.name : 'Choose a service'}</h2>
      <dl>
        <dt>Price</dt><dd>{svc ? `From ${inr(svc.price_from)}` : '—'}</dd>
        <dt>Duration</dt><dd>{svc ? `${svc.duration_min} min` : '—'}</dd>
        {product && <><dt>Product</dt><dd>{product.name}</dd></>}
        {form.vehicle_type && <><dt>Vehicle</dt><dd>{VEHICLE_TYPES[form.vehicle_type as VehicleType]}</dd></>}
        <dt>Date</dt><dd>{date ? fmtDate(date) : '—'}</dd>
        <dt>Time</dt><dd>{slot ? fmtTime(slot) : '—'}</dd>
      </dl>
      <div class="hairline" style="margin:18px 0" />
      <p class="muted" style="font-size:.82rem">This is a request: we confirm every booking by email. Pay at the workshop.</p>
    </aside>
  );

  if (done) {
    return (
      <div class="container book-wrap" id="booking">
        <div class="panel success" role="status">
          <div class="tick" dangerouslySetInnerHTML={{ __html: icons.check }} />
          <h2>Booking request sent!</h2>
          <p class="muted" style="margin-top:8px">Your reference number</p>
          <div class="ref">{done.ref}</div>
          <p>{svc?.name} · {fmtDate(date)} at {fmtTime(slot)}</p>
          <p class="muted" style="margin:10px auto 22px;max-width:460px"><b>Your time is not confirmed yet.</b> We'll check availability and email <b>{form.email}</b> once your booking is confirmed. If the time is taken, we'll contact you to arrange another.</p>
          <div class="ctas" style="justify-content:center">
            {whatsapp && <a class="btn btn-wa" target="_blank" rel="noopener" href={waLink(whatsapp, `Hi, I just booked ${svc?.name} (Ref ${done.ref}) for ${fmtDate(date)} ${fmtTime(slot)}.`)}>Message us on WhatsApp</a>}
            <a class="btn btn-outline" href="/">Back to Home</a>
          </div>
        </div>
        {summary}
      </div>
    );
  }

  return (
    <div class="container book-wrap" id="booking">
      <div>
        <ol class="steps">
          {['Service', 'Date & Time', 'Your Details'].map((t, i) => (
            <li class={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''} aria-current={step === i + 1 ? 'step' : undefined}>{i + 1}. {t}</li>
          ))}
        </ol>
        <div class="panel">
          {notice && <div class="alert bad" role="alert" style="margin-bottom:16px">{notice}</div>}

          {step === 1 && (
            <fieldset style="border:0">
              <legend><h2 style="font-size:1.25rem">Choose a service</h2></legend>
              <p class="muted" style="margin:4px 0 18px">What can we help you with?</p>
              <div class="svc-pick">
                {services.map((s) => (
                  <label>
                    <input type="radio" name="service" value={s.id} checked={service === s.id} onChange={() => setService(s.id)} />
                    <b>{s.name}</b><small>From {inr(s.price_from)} · {s.duration_min} min</small>
                  </label>
                ))}
              </div>
              <div class="form-nav"><span /><button type="button" class="btn btn-primary" onClick={() => goto(2)}>Continue</button></div>
            </fieldset>
          )}

          {step === 2 && (
            <div>
              <h2 style="font-size:1.25rem">Pick a date</h2>
              <p class="muted" style="margin:4px 0 14px">Closed on Sundays and holidays.</p>
              {loadErr && <div class="alert bad">{loadErr} <button type="button" class="btn btn-sm btn-outline" onClick={loadSlots}>Retry</button></div>}
              {!days && !loadErr && <p class="muted">Loading available slots…</p>}
              {days && (
                <div class="dates" role="group" aria-label="Dates">
                  {days.map((d) => {
                    const dt = new Date(d.date + 'T00:00:00');
                    const closed = d.slots.every((s) => s.reason === 'closed');
                    const full = !closed && !d.slots.some((s) => s.available);
                    return (
                      <button type="button" class="date" aria-pressed={date === d.date} disabled={closed || full} onClick={() => { setDate(d.date); setSlot(''); }}
                        aria-label={`${fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}${closed ? ', closed' : full ? ', fully booked' : ''}`}>
                        <small>{dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small><b>{dt.getDate()}</b>
                        <small>{closed ? 'Closed' : full ? 'Full' : dt.toLocaleDateString('en-IN', { month: 'short' })}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              {day && (
                <>
                  <h2 style="font-size:1.25rem;margin-top:22px">Pick a time</h2>
                  <div class="slots" role="group" aria-label="Time slots">
                    {day.slots.map((s) => (
                      <button type="button" class="slot" aria-pressed={slot === s.slot} disabled={!s.available} onClick={() => setSlot(s.slot)}>
                        {fmtTime(s.slot)}<small>{s.reason === 'past' ? 'Unavailable' : s.reason === 'full' ? 'Full' : `${s.remaining} left`}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div class="form-nav"><button type="button" class="btn btn-outline" onClick={() => goto(1)}>Back</button><button type="button" class="btn btn-primary" onClick={() => goto(3)}>Continue</button></div>
            </div>
          )}

          {step === 3 && (
            <form class="form-grid" noValidate onSubmit={submit}>
              <div class="full"><h2 style="font-size:1.25rem">Your details</h2><p class="muted" style="margin-top:4px">We'll email you as soon as your booking is confirmed.</p></div>
              <div class="field"><label for="b-name">Full name *</label><input {...field('name')} autoComplete="name" required /><Err k="name" /></div>
              <div class="field"><label for="b-phone">Mobile number *</label><input {...field('phone')} inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" required /><Err k="phone" /></div>
              <div class="field"><label for="b-email">Email *</label><input {...field('email')} type="email" autoComplete="email" required /><Err k="email" /></div>
              <fieldset class="field full" style="border:0" aria-describedby={errors.vehicle_type ? 'b-vehicle_type-err' : undefined}>
                <legend style="font-size:.8rem;font-weight:600;color:#3b4048;margin-bottom:6px">Vehicle type *</legend>
                <div class="vtype">
                  {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((t) => (
                    <label class={form.vehicle_type === t ? 'on' : ''}>
                      <input type="radio" name="vehicle_type" value={t} checked={form.vehicle_type === t}
                        onChange={() => { setForm((f) => ({ ...f, vehicle_type: t })); setErrors((er) => { const { vehicle_type: _, ...rest } = er; return rest; }); }} />
                      {VEHICLE_TYPES[t]}
                    </label>
                  ))}
                </div>
                <Err k="vehicle_type" />
              </fieldset>
              <div class="field full"><label for="b-vehicle">Vehicle brand & model *</label>
                <input {...field('vehicle')} list="vehicle-list" placeholder={form.vehicle_type ? TYPE_PLACEHOLDER[form.vehicle_type as VehicleType] : 'e.g. Honda Activa 6G'} required />
                <datalist id="vehicle-list">
                  {vehicles.filter((v) => !form.vehicle_type || TYPE_SEGMENTS[form.vehicle_type as VehicleType].includes(v.seg ?? '')).map((v) => <option value={v.label} />)}
                </datalist>
                <Err k="vehicle" /></div>
              <div class="field full"><label for="b-notes">Notes (optional)</label><textarea {...field('notes')} placeholder="Describe the issue or anything we should know" /><Err k="notes" /></div>
              <Turnstile onToken={setToken} resetKey={resetKey} />
              <div class="full form-nav" style="margin-top:6px">
                <button type="button" class="btn btn-outline" onClick={() => goto(2)}>Back</button>
                <button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send Booking Request'}</button>
              </div>
            </form>
          )}
        </div>
      </div>
      {summary}
    </div>
  );
}
