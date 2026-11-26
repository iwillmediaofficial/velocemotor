import { useEffect, useState } from 'preact/hooks';
import { errMsg, must, sb } from './lib';
import { Empty, Loading, Modal, Switch, useToast } from './ui';
import { inr, slugify } from '../../lib/format';
import { VEHICLE_TYPES } from '../../lib/schemas';
import { VEHICLE_ORDER, sortPrices } from '../../lib/pricing';
import type { ServicePrice, VehicleTypeId } from '../../lib/types';

interface Row {
  id: string; name: string; description: string; is_bookable: boolean; is_active: boolean; sort: number;
  service_prices: ServicePrice[];
}

export default function Services({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  const load = async () => {
    const [s, b] = await Promise.all([
      sb().from('services').select('*,service_prices(vehicle_type,price,duration_min)').order('sort').order('name'),
      sb().from('services').select('id,bookings(count)'),
    ]);
    setRows((must(s) as Row[]).map((r) => ({ ...r, service_prices: sortPrices(r.service_prices.map((p) => ({ ...p, price: Number(p.price) }))) })));
    setBookingCounts(Object.fromEntries((must(b) as { id: string; bookings: { count: number }[] }[]).map((x) => [x.id, x.bookings[0]?.count ?? 0])));
  };
  useEffect(() => { load(); }, []);

  const patch = async (id: string, values: Partial<Row>) => {
    try { must(await sb().from('services').update(values).eq('id', id).select('id')); await load(); onChange(); toast('Saved'); }
    catch (e) { toast(errMsg(e), 'bad'); }
  };

  const remove = async (s: Row) => {
    const n = bookingCounts[s.id] ?? 0;
    if (n > 0) {
      toast(`"${s.name}" has ${n} booking${n > 1 ? 's' : ''}, so it can't be deleted. Switch "Shown" off to hide it instead.`, 'bad');
      return;
    }
    if (!confirm(`Delete the service "${s.name}" permanently?`)) return;
    try {
      must(await sb().from('services').delete().eq('id', s.id).select('id'));
      toast('Service deleted');
      await load(); onChange();
    } catch (e) {
      toast(errMsg(e).includes('foreign key') ? 'This service has bookings, so it cannot be deleted. Hide it instead.' : errMsg(e), 'bad');
    }
  };

  if (!rows) return <Loading />;
  return (
    <>
      <div class="atools">
        <p class="muted" style="font-size:.85rem;flex:1">Each service has its own price and time for each vehicle type it is offered for. Customers pick their vehicle first and only see services available for it.</p>
        <button class="btn btn-primary btn-sm" onClick={() => setEditing('new')}>+ Add service</button>
      </div>
      {!rows.length ? <Empty>No services yet.</Empty> : (
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Order</th><th>Service</th>{VEHICLE_ORDER.map((t) => <th>{VEHICLE_TYPES[t]}</th>)}<th>Bookings</th><th>Online booking</th><th>Shown</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr>
                  <td>{s.sort}</td>
                  <td><b>{s.name}</b><br /><small class="muted" style="display:block;max-width:300px">{s.description}</small></td>
                  {VEHICLE_ORDER.map((t) => {
                    const p = s.service_prices.find((x) => x.vehicle_type === t);
                    return <td style="white-space:nowrap">{p ? <>{inr(p.price)}<br /><small class="muted">{p.duration_min} min</small></> : <span class="muted">Not offered</span>}</td>;
                  })}
                  <td>{bookingCounts[s.id] ?? 0}</td>
                  <td><Switch label="Bookable online" checked={s.is_bookable} onChange={(v) => patch(s.id, { is_bookable: v })} /></td>
                  <td><Switch label="Shown on website" checked={s.is_active} onChange={(v) => patch(s.id, { is_active: v })} /></td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-outline btn-sm" onClick={() => setEditing(s)}>Edit</button>{' '}
                    <button class="btn btn-sm" style="color:var(--danger)" onClick={() => remove(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ServiceEditor
          row={editing === 'new' ? null : editing}
          existingIds={rows.map((r) => r.id)}
          nextSort={Math.max(0, ...rows.map((r) => r.sort)) + 1}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); onChange(); toast('Saved'); }}
        />
      )}
    </>
  );
}

type PriceDraft = { offered: boolean; price: string; duration: string };

function ServiceEditor({ row, existingIds, nextSort, onClose, onSaved }: {
  row: Row | null; existingIds: string[]; nextSort: number; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    name: row?.name ?? '', description: row?.description ?? '',
    is_bookable: row?.is_bookable ?? true, is_active: row?.is_active ?? true, sort: row?.sort ?? nextSort,
  });
  const [prices, setPrices] = useState<Record<VehicleTypeId, PriceDraft>>(() => {
    const init = {} as Record<VehicleTypeId, PriceDraft>;
    for (const t of VEHICLE_ORDER) {
      const p = row?.service_prices.find((x) => x.vehicle_type === t);
      init[t] = p ? { offered: true, price: String(p.price), duration: String(p.duration_min) } : { offered: !row && t !== 'car', price: '', duration: '30' };
    }
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof v>) => setV((cur) => ({ ...cur, ...p }));
  const setPrice = (t: VehicleTypeId, p: Partial<PriceDraft>) => setPrices((cur) => ({ ...cur, [t]: { ...cur[t], ...p } }));

  const save = async (e: Event) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (v.name.trim().length < 2) err.name = 'Enter a service name';
    const offered = VEHICLE_ORDER.filter((t) => prices[t].offered);
    if (!offered.length) err.prices = 'Offer the service for at least one vehicle type';
    for (const t of offered) {
      if (prices[t].price === '' || Number(prices[t].price) < 0) err[`price_${t}`] = 'Enter a price';
      if (!(Number(prices[t].duration) > 0)) err[`dur_${t}`] = 'Enter minutes';
    }
    setErrors(err);
    if (Object.keys(err).length) return;

    const values = { name: v.name.trim(), description: v.description.trim(), is_bookable: v.is_bookable, is_active: v.is_active, sort: Number(v.sort) || 0 };
    setBusy(true);
    try {
      let id = row?.id;
      if (id) {
        must(await sb().from('services').update(values).eq('id', id).select('id'));
      } else {
        // the id is a permanent short code (used in booking links like /book?service=…)
        id = slugify(v.name) || 'service';
        for (let i = 2; existingIds.includes(id); i++) id = `${slugify(v.name)}-${i}`;
        must(await sb().from('services').insert({ id, ...values }).select('id'));
      }
      const upserts = offered.map((t) => ({ service_id: id, vehicle_type: t, price: Number(prices[t].price), duration_min: Math.round(Number(prices[t].duration)) }));
      must(await sb().from('service_prices').upsert(upserts, { onConflict: 'service_id,vehicle_type' }).select('service_id'));
      const removed = VEHICLE_ORDER.filter((t) => !prices[t].offered);
      if (removed.length) must(await sb().from('service_prices').delete().eq('service_id', id).in('vehicle_type', removed).select('service_id'));
      onSaved();
    } catch (e2) { toast(errMsg(e2), 'bad'); } finally { setBusy(false); }
  };

  return (
    <Modal title={row ? `Edit: ${row.name}` : 'Add service'} onClose={onClose} wide>
      <form class="form-grid" noValidate onSubmit={save}>
        <div class="field full"><label for="s-name">Service name *</label>
          <input id="s-name" class="input" value={v.name} aria-invalid={errors.name ? true : undefined} onInput={(e) => set({ name: e.currentTarget.value })} placeholder="e.g. Fork Oil Change" />
          <span class="err-msg">{errors.name}</span></div>
        <div class="field full"><label for="s-desc">Description</label>
          <textarea id="s-desc" class="input" value={v.description} onInput={(e) => set({ description: e.currentTarget.value })} placeholder="What's included, shown on the Services page" /></div>

        <fieldset class="field full" style="border:0">
          <legend style="font-size:.8rem;font-weight:600;margin-bottom:6px">Price & time by vehicle type *</legend>
          <div class="tbl-wrap">
            <table class="tbl price-matrix">
              <thead><tr><th>Vehicle type</th><th>Offered</th><th>Price (₹)</th><th>Time (minutes)</th></tr></thead>
              <tbody>
                {VEHICLE_ORDER.map((t) => (
                  <tr class={prices[t].offered ? '' : 'muted-row'}>
                    <td><b>{VEHICLE_TYPES[t]}</b></td>
                    <td><Switch label={`Offer for ${VEHICLE_TYPES[t]}`} checked={prices[t].offered} onChange={(on) => setPrice(t, { offered: on })} /></td>
                    <td>
                      <input class="input" type="number" min={0} step={1} style="width:130px" aria-label={`${VEHICLE_TYPES[t]} price`} disabled={!prices[t].offered}
                        value={prices[t].price} aria-invalid={errors[`price_${t}`] ? true : undefined} onInput={(e) => setPrice(t, { price: e.currentTarget.value })} />
                      <div class="err-msg">{errors[`price_${t}`]}</div>
                    </td>
                    <td>
                      <input class="input" type="number" min={5} step={5} style="width:110px" aria-label={`${VEHICLE_TYPES[t]} time in minutes`} disabled={!prices[t].offered}
                        value={prices[t].duration} aria-invalid={errors[`dur_${t}`] ? true : undefined} onInput={(e) => setPrice(t, { duration: e.currentTarget.value })} />
                      <div class="err-msg">{errors[`dur_${t}`]}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span class="err-msg">{errors.prices}</span>
          <small class="muted">Switch a vehicle type off if this service isn't done for it; customers with that vehicle won't see the service. Existing bookings keep the price they were quoted.</small>
        </fieldset>

        <div class="field full" style="flex-direction:row;gap:22px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" checked={v.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} /> Shown on website</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" checked={v.is_bookable} onChange={(e) => set({ is_bookable: e.currentTarget.checked })} /> Customers can book it online</label>
          <label style="display:flex;gap:8px;align-items:center">Display order <input class="input" type="number" style="width:90px" value={v.sort} onInput={(e) => set({ sort: Number(e.currentTarget.value) })} /></label>
        </div>
        {row && <p class="muted full" style="font-size:.8rem">Booking link code: <code>{row.id}</code> (doesn't change when you rename the service).</p>}
        <div class="full form-nav">
          <button type="button" class="btn btn-outline" onClick={onClose}>Cancel</button>
          <button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : row ? 'Save service' : 'Add service'}</button>
        </div>
      </form>
    </Modal>
  );
}
