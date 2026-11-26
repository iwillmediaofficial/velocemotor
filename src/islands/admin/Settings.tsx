import { useEffect, useState } from 'preact/hooks';
import { errMsg, must, sb } from './lib';
import { Loading, useToast } from './ui';

interface S {
  phone: string; whatsapp: string; email: string; address: string; hours: string;
  slots: string[]; slot_capacity: number; closed_days: number[]; holidays: string[]; booking_days: number; min_lead_minutes: number;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SettingsPage({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<S | null>(null);
  const [slotsText, setSlotsText] = useState('');
  const [holidaysText, setHolidaysText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb().from('settings').select('phone,whatsapp,email,address,hours,slots,slot_capacity,closed_days,holidays,booking_days,min_lead_minutes').eq('id', 1).single()
      .then((r) => { const d = must(r) as S; setS(d); setSlotsText(d.slots.join(', ')); setHolidaysText(d.holidays.join(', ')); });
  }, []);
  if (!s) return <Loading />;
  const set = (p: Partial<S>) => setS({ ...s, ...p });

  const save = async (e: Event) => {
    e.preventDefault();
    const slots = slotsText.split(',').map((x) => x.trim()).filter(Boolean);
    const bad = slots.find((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.padStart(5, '0')));
    if (bad || !slots.length) return toast(`Slots must be times like 10:00, 14:30${bad ? ` ("${bad}" is not valid)` : ''}`, 'bad');
    const holidays = holidaysText.split(',').map((x) => x.trim()).filter(Boolean);
    const badH = holidays.find((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x));
    if (badH) return toast(`Holidays must be dates like 2026-12-25 ("${badH}" is not valid)`, 'bad');
    setBusy(true);
    try {
      must(await sb().from('settings').update({
        ...s, whatsapp: s.whatsapp.replace(/\D/g, ''), slots: [...new Set(slots.map((x) => x.padStart(5, '0')))].sort(), holidays,
      }).eq('id', 1).select('id'));
      toast('Settings saved. Booking rules apply right away; contact details update on the website after you publish.');
      onChange();
    } catch (e2) { toast(errMsg(e2), 'bad'); } finally { setBusy(false); }
  };

  const text = (k: keyof S, label: string, extra: Record<string, unknown> = {}) => (
    <div class="field"><label for={`s-${k}`}>{label}</label><input id={`s-${k}`} class="input" value={s[k] as string} onInput={(e) => set({ [k]: e.currentTarget.value } as Partial<S>)} {...extra} /></div>
  );

  return (
    <form class="panel" onSubmit={save}>
      <h2 style="font-size:1.1rem;margin-bottom:14px">Contact details (shown on the website)</h2>
      <div class="form-grid">
        {text('phone', 'Phone')}
        {text('whatsapp', 'WhatsApp number with country code (e.g. 917622884414)', { inputMode: 'numeric' })}
        {text('email', 'Email (receives booking & enquiry alerts)', { type: 'email' })}
        {text('hours', 'Opening hours')}
        <div class="full">{text('address', 'Address')}</div>
      </div>

      <h2 style="font-size:1.1rem;margin:28px 0 14px">Online booking rules (apply immediately)</h2>
      <div class="form-grid">
        <div class="field"><label for="s-slots">Time slots (24h, comma separated)</label><input id="s-slots" class="input" value={slotsText} onInput={(e) => setSlotsText(e.currentTarget.value)} /></div>
        <div class="field"><label for="s-cap">Bookings per slot</label><input id="s-cap" class="input" type="number" min={1} max={50} value={s.slot_capacity} onInput={(e) => set({ slot_capacity: Number(e.currentTarget.value) })} /></div>
        <div class="field"><label for="s-days">Days ahead customers can book</label><input id="s-days" class="input" type="number" min={1} max={90} value={s.booking_days} onInput={(e) => set({ booking_days: Number(e.currentTarget.value) })} /></div>
        <div class="field"><label for="s-lead">Minimum notice (minutes)</label><input id="s-lead" class="input" type="number" min={0} value={s.min_lead_minutes} onInput={(e) => set({ min_lead_minutes: Number(e.currentTarget.value) })} /></div>
        <fieldset class="field full" style="border:0">
          <legend style="font-size:.8rem;font-weight:600;margin-bottom:6px">Closed on</legend>
          <div class="chips">{DAYS.map((d, i) => (
            <label class="chip" style="display:flex;gap:6px"><input type="checkbox" checked={s.closed_days.includes(i)} onChange={(e) => set({ closed_days: e.currentTarget.checked ? [...s.closed_days, i] : s.closed_days.filter((x) => x !== i) })} />{d}</label>
          ))}</div>
        </fieldset>
        <div class="field full"><label for="s-hol">Holidays (YYYY-MM-DD, comma separated)</label><input id="s-hol" class="input" placeholder="2026-12-25, 2027-01-01" value={holidaysText} onInput={(e) => setHolidaysText(e.currentTarget.value)} /></div>
      </div>
      <div class="form-nav"><span /><button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  );
}
