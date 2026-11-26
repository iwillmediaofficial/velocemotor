// Admin: record a booking taken by phone, walk-in or WhatsApp. It uses the same slots and capacity
// as online bookings, so a confirmed phone booking immediately blocks that time on the website.
import { useEffect, useState } from 'preact/hooks';
import { adminApi, errMsg, must, sb, todayIST } from './lib';
import { Loading, Modal, useToast } from './ui';
import { fmtDate, fmtTime, inr } from '../../lib/format';
import { adminCreateBookingSchema, BOOKING_SOURCES, fieldErrors, VEHICLE_TYPES, type VehicleType } from '../../lib/schemas';
import { VEHICLE_ORDER, sortPrices } from '../../lib/pricing';
import type { ServicePrice } from '../../lib/types';

interface Svc { id: string; name: string; is_active: boolean; service_prices: ServicePrice[] }
interface Rules { slots: string[]; slot_capacity: number; closed_days: number[]; holidays: string[] }
interface SlotUse { taken: number; requests: number }

const BLOCKING = ['confirmed', 'rescheduled', 'completed'];
type Source = 'phone' | 'walk_in' | 'whatsapp';

export default function NewBooking({ onClose, onCreated }: { onClose: () => void; onCreated: (ref: string) => void }) {
  const toast = useToast();
  const [services, setServices] = useState<Svc[] | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [use, setUse] = useState<Record<string, SlotUse>>({});
  const [f, setF] = useState({
    source: 'phone' as Source, status: 'confirmed' as 'confirmed' | 'pending',
    name: '', phone: '', email: '', vehicle_type: '' as VehicleType | '', vehicle: '',
    service: '', price: '', date: todayIST(), slot: '', notes: '', admin_note: '', notify: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((cur) => ({ ...cur, ...p }));

  useEffect(() => {
    Promise.all([
      sb().from('services').select('id,name,is_active,service_prices(vehicle_type,price,duration_min)').order('sort'),
      sb().from('settings').select('slots,slot_capacity,closed_days,holidays').eq('id', 1).single(),
    ]).then(([s, r]) => {
      setServices((must(s) as Svc[]).map((x) => ({ ...x, service_prices: sortPrices(x.service_prices.map((p) => ({ ...p, price: Number(p.price) }))) })));
      setRules(must(r) as Rules);
    }).catch((e) => toast(errMsg(e), 'bad'));
  }, []);

  // occupancy of each slot on the chosen date
  useEffect(() => {
    if (!f.date) return;
    sb().from('bookings').select('slot,status').eq('booking_date', f.date).neq('status', 'cancelled').then(({ data }) => {
      const u: Record<string, SlotUse> = {};
      for (const b of (data ?? []) as { slot: string; status: string }[]) {
        u[b.slot] ??= { taken: 0, requests: 0 };
        if (BLOCKING.includes(b.status)) u[b.slot].taken++;
        else if (b.status === 'pending') u[b.slot].requests++;
      }
      setUse(u);
    });
  }, [f.date]);

  if (!services || !rules) return <Modal title="New booking" onClose={onClose}><Loading /></Modal>;

  const vt = f.vehicle_type || null;
  const offered = (s: Svc) => !vt || s.service_prices.some((p) => p.vehicle_type === vt);
  const listPrice = (id: string, t: string | null) => services.find((s) => s.id === id)?.service_prices.find((p) => p.vehicle_type === t) ?? null;
  const lp = listPrice(f.service, vt);

  const chooseType = (t: VehicleType) => {
    const keep = f.service && listPrice(f.service, t);
    set({ vehicle_type: t, service: keep ? f.service : '', price: keep ? String(listPrice(f.service, t)!.price) : '' });
  };
  const chooseService = (id: string) => set({ service: id, price: vt && listPrice(id, vt) ? String(listPrice(id, vt)!.price) : '' });

  const d = f.date ? new Date(f.date + 'T00:00:00') : null;
  const closed = !!d && (rules.closed_days.includes(d.getDay()) || rules.holidays.includes(f.date));
  const isToday = f.date === todayIST();
  const nowHM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(new Date());

  const submit = async (e: Event) => {
    e.preventDefault();
    const payload = { ...f, price: f.price === '' ? null : Number(f.price) };
    const parsed = adminCreateBookingSchema.safeParse(payload);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({}); setBusy(true);
    try {
      const r = await adminApi<{ booking: { ref: string }; emailed: boolean }>('/bookings', { method: 'POST', json: parsed.data });
      toast(`Booking ${r.booking.ref} saved${r.emailed ? `, email sent to ${f.email}` : ''}`);
      onCreated(r.booking.ref);
    } catch (err) {
      const e2 = err as { message: string; fields?: Record<string, string>; error?: string };
      if (e2.fields) setErrors(e2.fields);
      if (e2.error === 'SLOT_FULL') set({ slot: '' });
      toast(e2.message, 'bad');
    } finally { setBusy(false); }
  };

  const inp = (k: 'name' | 'phone' | 'email' | 'vehicle', extra: Record<string, unknown> = {}) => ({
    id: `nb-${k}`, class: 'input', value: f[k], 'aria-invalid': errors[k] ? true : undefined,
    onInput: (e: Event) => { const value = (e.currentTarget as HTMLInputElement).value; set({ [k]: value } as Partial<typeof f>); }, ...extra,
  });
  const Err = ({ k }: { k: string }) => <span class="err-msg">{errors[k] ?? ''}</span>;

  return (
    <Modal title="New booking" onClose={onClose} wide>
      <form class="form-grid" noValidate onSubmit={submit}>
        <fieldset class="field full" style="border:0">
          <legend class="nb-legend">Booked by</legend>
          <div class="chips" role="radiogroup">
            {(['phone', 'walk_in', 'whatsapp'] as Source[]).map((s) => (
              <button type="button" class="chip" role="radio" aria-checked={f.source === s} aria-pressed={f.source === s}
                onClick={() => set({ source: s, ...(s === 'walk_in' ? { date: todayIST() } : {}) })}>{BOOKING_SOURCES[s]}</button>
            ))}
          </div>
        </fieldset>

        <div class="field"><label for="nb-name">Customer name *</label><input {...inp('name', { autoComplete: 'off' })} /><Err k="name" /></div>
        <div class="field"><label for="nb-phone">Mobile number *</label><input {...inp('phone', { inputMode: 'tel', autoComplete: 'off', placeholder: '10-digit mobile' })} /><Err k="phone" /></div>
        <div class="field full"><label for="nb-email">Email (optional)</label><input {...inp('email', { type: 'email', autoComplete: 'off' })} /><Err k="email" /></div>

        <fieldset class="field full" style="border:0">
          <legend class="nb-legend">Vehicle type *</legend>
          <div class="chips" role="radiogroup">
            {VEHICLE_ORDER.map((t) => (
              <button type="button" class="chip" role="radio" aria-checked={f.vehicle_type === t} aria-pressed={f.vehicle_type === t} onClick={() => chooseType(t)}>{VEHICLE_TYPES[t]}</button>
            ))}
          </div>
          <Err k="vehicle_type" />
        </fieldset>
        <div class="field full"><label for="nb-vehicle">Vehicle brand & model *</label><input {...inp('vehicle', { placeholder: 'e.g. Honda Activa 6G' })} /><Err k="vehicle" /></div>

        <div class="field"><label for="nb-service">Service *</label>
          <select id="nb-service" class="input" value={f.service} aria-invalid={errors.service ? true : undefined} onChange={(e) => chooseService(e.currentTarget.value)} disabled={!vt}>
            <option value="">{vt ? 'Choose a service' : 'Choose the vehicle type first'}</option>
            {services.filter(offered).map((s) => {
              const p = vt ? listPrice(s.id, vt) : null;
              return <option value={s.id}>{s.name}{p ? ` · ${inr(p.price)} · ${p.duration_min} min` : ''}{s.is_active ? '' : ' (hidden on website)'}</option>;
            })}
          </select><Err k="service" /></div>
        <div class="field"><label for="nb-price">Price (₹)</label>
          <input id="nb-price" class="input" type="number" min={0} step={1} value={f.price} disabled={!f.service} onInput={(e) => set({ price: e.currentTarget.value })} />
          <small class="muted">{lp ? (Number(f.price) !== lp.price && f.price !== '' ? `Price list: ${inr(lp.price)} (changed for this booking)` : 'From the price list; change it if you agreed a different price.') : ' '}</small>
          <Err k="price" /></div>

        <div class="field"><label for="nb-date">Date *</label>
          <input id="nb-date" class="input" type="date" min={todayIST()} value={f.date} onChange={(e) => set({ date: e.currentTarget.value, slot: '' })} />
          <Err k="date" /></div>
        <fieldset class="field" style="border:0">
          <legend class="nb-legend">Status</legend>
          <label class="nb-radio"><input type="radio" name="nb-status" checked={f.status === 'confirmed'} onChange={() => set({ status: 'confirmed' })} /> Confirmed (blocks the time)</label>
          <label class="nb-radio"><input type="radio" name="nb-status" checked={f.status === 'pending'} onChange={() => set({ status: 'pending' })} /> Pending request (decide later)</label>
        </fieldset>

        <fieldset class="field full" style="border:0">
          <legend class="nb-legend">Time * {f.date && <span class="muted" style="font-weight:400">· {fmtDate(f.date, { weekday: 'long', day: 'numeric', month: 'long' })}</span>}</legend>
          {closed ? <div class="alert bad">The workshop is closed on this day (see Settings). Pick another date.</div> : (
            <div class="nb-slots">
              {rules.slots.map((s) => {
                const u = use[s] ?? { taken: 0, requests: 0 };
                const full = u.taken >= rules.slot_capacity;
                const passed = isToday && s < nowHM;
                return (
                  <button type="button" class="slot" aria-pressed={f.slot === s} disabled={full && f.status === 'confirmed'} onClick={() => set({ slot: s })}
                    title={full ? 'Full with confirmed bookings' : ''}>
                    {fmtTime(s)}
                    <small>{full ? 'Full' : `${u.taken}/${rules.slot_capacity} booked`}{u.requests ? ` · ${u.requests} req.` : ''}{passed ? ' · passed' : ''}</small>
                  </button>
                );
              })}
            </div>
          )}
          <Err k="slot" />
        </fieldset>

        <div class="field full"><label for="nb-notes">Customer's request / problem</label>
          <textarea id="nb-notes" class="input" style="min-height:64px" value={f.notes} onInput={(e) => set({ notes: e.currentTarget.value })} /></div>
        <div class="field full"><label for="nb-anote">Internal note (not sent to customer)</label>
          <textarea id="nb-anote" class="input" style="min-height:64px" value={f.admin_note} onInput={(e) => set({ admin_note: e.currentTarget.value })} /></div>

        <label class="full" style="display:flex;gap:8px;align-items:center;font-size:.9rem">
          <input type="checkbox" checked={f.notify && !!f.email} disabled={!f.email} onChange={(e) => set({ notify: e.currentTarget.checked })} />
          Email the customer {f.status === 'confirmed' ? 'a booking confirmation' : 'that we received the request'}{!f.email && ' (add an email address to enable)'}
        </label>

        <div class="full form-nav">
          <span class="muted" style="font-size:.85rem;align-self:center">
            {f.service && vt && f.slot ? `${services.find((s) => s.id === f.service)?.name} · ${VEHICLE_TYPES[vt]} · ${fmtDate(f.date)} ${fmtTime(f.slot)}${f.price !== '' ? ` · ${inr(f.price)}` : ''}` : ''}
          </span>
          <div style="display:flex;gap:10px">
            <button type="button" class="btn btn-outline" onClick={onClose}>Cancel</button>
            <button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : f.status === 'confirmed' ? 'Save confirmed booking' : 'Save as request'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
