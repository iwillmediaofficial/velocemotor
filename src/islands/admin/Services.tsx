import { useEffect, useState } from 'preact/hooks';
import { errMsg, must, sb } from './lib';
import { Empty, Loading, Modal, Switch, useToast } from './ui';
import { inr, slugify } from '../../lib/format';

interface Row { id: string; name: string; description: string; price_from: number; duration_min: number; is_bookable: boolean; is_active: boolean; sort: number }

export default function Services({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  const load = async () => {
    const [s, b] = await Promise.all([
      sb().from('services').select('*').order('sort').order('name'),
      sb().from('services').select('id,bookings(count)'),
    ]);
    setRows(must(s) as Row[]);
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
        <p class="muted" style="font-size:.85rem;flex:1">Services appear on the Services page and in the booking form.</p>
        <button class="btn btn-primary btn-sm" onClick={() => setEditing('new')}>+ Add service</button>
      </div>
      {!rows.length ? <Empty>No services yet.</Empty> : (
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Order</th><th>Service</th><th>Price from</th><th>Duration</th><th>Bookings</th><th>Online booking</th><th>Shown</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr>
                  <td>{s.sort}</td>
                  <td><b>{s.name}</b><br /><small class="muted" style="display:block;max-width:360px">{s.description}</small></td>
                  <td>{inr(s.price_from)}</td>
                  <td>{s.duration_min} min</td>
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

function ServiceEditor({ row, existingIds, nextSort, onClose, onSaved }: {
  row: Row | null; existingIds: string[]; nextSort: number; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    name: row?.name ?? '', description: row?.description ?? '',
    price_from: row ? String(row.price_from) : '', duration_min: row ? String(row.duration_min) : '30',
    is_bookable: row?.is_bookable ?? true, is_active: row?.is_active ?? true, sort: row?.sort ?? nextSort,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof v>) => setV((cur) => ({ ...cur, ...p }));

  const save = async (e: Event) => {
    e.preventDefault();
    const err: Record<string, string> = {};
    if (v.name.trim().length < 2) err.name = 'Enter a service name';
    if (v.price_from === '' || Number(v.price_from) < 0) err.price_from = 'Enter a price (0 or more)';
    if (!(Number(v.duration_min) > 0)) err.duration_min = 'Enter the duration in minutes';
    setErrors(err);
    if (Object.keys(err).length) return;

    const values = {
      name: v.name.trim(), description: v.description.trim(), price_from: Number(v.price_from), duration_min: Math.round(Number(v.duration_min)),
      is_bookable: v.is_bookable, is_active: v.is_active, sort: Number(v.sort) || 0,
    };
    setBusy(true);
    try {
      if (row) {
        must(await sb().from('services').update(values).eq('id', row.id).select('id'));
      } else {
        // the id is a permanent short code (used in booking links like /book?service=…)
        let id = slugify(v.name) || 'service';
        for (let i = 2; existingIds.includes(id); i++) id = `${slugify(v.name)}-${i}`;
        must(await sb().from('services').insert({ id, ...values }).select('id'));
      }
      onSaved();
    } catch (e2) { toast(errMsg(e2), 'bad'); } finally { setBusy(false); }
  };

  return (
    <Modal title={row ? `Edit: ${row.name}` : 'Add service'} onClose={onClose}>
      <form class="form-grid" noValidate onSubmit={save}>
        <div class="field full"><label for="s-name">Service name *</label>
          <input id="s-name" class="input" value={v.name} aria-invalid={errors.name ? true : undefined} onInput={(e) => set({ name: e.currentTarget.value })} placeholder="e.g. Fork Oil Change" />
          <span class="err-msg">{errors.name}</span></div>
        <div class="field"><label for="s-price">Price from (₹) *</label>
          <input id="s-price" class="input" type="number" min={0} step={1} value={v.price_from} aria-invalid={errors.price_from ? true : undefined} onInput={(e) => set({ price_from: e.currentTarget.value })} />
          <span class="err-msg">{errors.price_from}</span></div>
        <div class="field"><label for="s-dur">Duration (minutes) *</label>
          <input id="s-dur" class="input" type="number" min={5} step={5} value={v.duration_min} aria-invalid={errors.duration_min ? true : undefined} onInput={(e) => set({ duration_min: e.currentTarget.value })} />
          <span class="err-msg">{errors.duration_min}</span></div>
        <div class="field full"><label for="s-desc">Description</label>
          <textarea id="s-desc" class="input" value={v.description} onInput={(e) => set({ description: e.currentTarget.value })} placeholder="What's included, shown on the Services page" /></div>
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
