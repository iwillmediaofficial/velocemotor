import { useEffect, useState } from 'preact/hooks';
import { adminApi, ago, errMsg, must, sb, todayIST } from './lib';
import { Empty, Loading, Modal, Status, useToast } from './ui';
import { fmtDate, fmtTime } from '../../lib/format';
import { BOOKING_STATUSES } from '../../lib/schemas';

export interface BookingListRow {
  id: string; ref: string; name: string; phone: string; email: string | null; vehicle: string;
  booking_date: string; slot: string; status: string; notes: string | null; admin_note: string | null; created_at: string;
  service_id: string; services: { name: string } | null; products: { name: string } | null;
}

const COLS = 'id,ref,name,phone,email,vehicle,booking_date,slot,status,notes,admin_note,created_at,service_id,services(name),products(name)';
const PAGE = 25;

export default function Bookings({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<BookingListRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [f, setF] = useState({ status: '', date: '', q: '', upcoming: false });

  const load = async () => {
    let q = sb().from('bookings').select(COLS, { count: 'exact' });
    if (f.status) q = q.eq('status', f.status);
    if (f.date) q = q.eq('booking_date', f.date);
    if (f.upcoming) q = q.gte('booking_date', todayIST());
    const term = f.q.trim().replace(/[%,()]/g, '');
    if (term) q = q.or(`ref.ilike.%${term}%,name.ilike.%${term}%,phone.ilike.%${term}%,vehicle.ilike.%${term}%`);
    q = f.upcoming ? q.order('booking_date').order('slot') : q.order('created_at', { ascending: false });
    const res = await q.range(page * PAGE, page * PAGE + PAGE - 1);
    setRows(must(res) as unknown as BookingListRow[]);
    setTotal(res.count ?? 0);
  };
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [f, page]);

  const set = (patch: Partial<typeof f>) => { setPage(0); setF({ ...f, ...patch }); };

  return (
    <>
      <div class="atools">
        <input class="input" type="search" placeholder="Search ref, name, phone, vehicle…" aria-label="Search bookings" value={f.q} onInput={(e) => set({ q: e.currentTarget.value })} />
        <select class="input" aria-label="Status" value={f.status} onChange={(e) => set({ status: e.currentTarget.value })}>
          <option value="">All statuses</option>{BOOKING_STATUSES.map((s) => <option value={s}>{s}</option>)}
        </select>
        <input class="input" type="date" aria-label="Date" value={f.date} onChange={(e) => set({ date: e.currentTarget.value })} />
        <label style="display:flex;gap:6px;align-items:center;font-size:.9rem"><input type="checkbox" checked={f.upcoming} onChange={(e) => set({ upcoming: e.currentTarget.checked })} /> Upcoming only</label>
        <button class="btn btn-outline btn-sm" onClick={() => set({ status: '', date: '', q: '', upcoming: false })}>Reset</button>
      </div>
      {rows ? <BookingTable rows={rows} onChanged={() => { load(); onChange(); }} /> : <Loading />}
      {total > PAGE && (
        <div class="pager">
          <button class="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span class="muted">Page {page + 1} of {Math.ceil(total / PAGE)} · {total} bookings</span>
          <button class="btn btn-outline btn-sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </>
  );
}

export function BookingTable({ rows, onChanged }: { rows: BookingListRow[]; onChanged: () => void }) {
  const [open, setOpen] = useState<BookingListRow | null>(null);
  if (!rows.length) return <Empty>No bookings found.</Empty>;
  return (
    <>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Ref</th><th>Customer</th><th>Service</th><th>Date & time</th><th>Vehicle</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr class="click" tabIndex={0} onClick={() => setOpen(b)} onKeyDown={(e) => e.key === 'Enter' && setOpen(b)}>
                <td><b>{b.ref}</b></td>
                <td>{b.name}<br /><small class="muted">{b.phone}</small></td>
                <td>{b.services?.name ?? b.service_id}</td>
                <td>{fmtDate(b.booking_date)}<br /><small class="muted">{fmtTime(b.slot)}</small></td>
                <td>{b.vehicle}</td>
                <td><Status s={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <BookingModal b={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); onChanged(); }} />}
    </>
  );
}

function BookingModal({ b, onClose, onSaved }: { b: BookingListRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState(b.admin_note ?? '');
  const [date, setDate] = useState(b.booking_date);
  const [slot, setSlot] = useState(b.slot);
  const [slots, setSlots] = useState<string[]>([b.slot]);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb().from('settings').select('slots').eq('id', 1).single().then(({ data }) => data && setSlots([...new Set([...(data.slots as string[]), b.slot])].sort()));
  }, []);

  const save = async (patch: Record<string, unknown>, label: string) => {
    setBusy(true);
    try {
      const r = await adminApi<{ emailed: boolean }>(`/bookings/${b.id}`, { method: 'POST', json: { ...patch, admin_note: note, notify } });
      toast(`${label}.${r.emailed ? ` Email sent to ${b.email}.` : ''}`);
      onSaved();
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };
  const phone10 = b.phone.replace(/\D/g, '').slice(-10);

  return (
    <Modal title={`Booking ${b.ref}`} onClose={onClose}>
      <dl class="kv">
        <dt>Status</dt><dd><Status s={b.status} /></dd>
        <dt>Service</dt><dd>{b.services?.name ?? b.service_id}</dd>
        <dt>Date & time</dt><dd>{fmtDate(b.booking_date)} · {fmtTime(b.slot)}</dd>
        <dt>Customer</dt><dd>{b.name}</dd>
        <dt>Phone</dt><dd><a href={`tel:+91${phone10}`}>{b.phone}</a> · <a target="_blank" rel="noopener" style="color:var(--wa)" href={`https://wa.me/91${phone10}`}>WhatsApp</a></dd>
        <dt>Email</dt><dd>{b.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : '—'}</dd>
        <dt>Vehicle</dt><dd>{b.vehicle}</dd>
        {b.products && <><dt>Product</dt><dd>{b.products.name}</dd></>}
        <dt>Customer notes</dt><dd style="white-space:pre-wrap">{b.notes || '—'}</dd>
        <dt>Received</dt><dd>{ago(b.created_at)}</dd>
      </dl>

      <div class="field" style="margin-top:18px"><label for="bk-note">Internal note (not sent to customer)</label><textarea id="bk-note" class="input" style="min-height:70px" value={note} onInput={(e) => setNote(e.currentTarget.value)} /></div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-weight:600;font-size:.9rem">Reschedule</summary>
        <div class="form-grid" style="margin-top:10px">
          <input class="input" type="date" aria-label="New date" min={todayIST()} value={date} onChange={(e) => setDate(e.currentTarget.value)} />
          <select class="input" aria-label="New time" value={slot} onChange={(e) => setSlot(e.currentTarget.value)}>{slots.map((s) => <option value={s}>{fmtTime(s)}</option>)}</select>
        </div>
        <button class="btn btn-outline btn-sm" style="margin-top:10px" disabled={busy || (date === b.booking_date && slot === b.slot)} onClick={() => save({ date, slot }, 'Rescheduled')}>Save new time</button>
      </details>

      <label style="display:flex;gap:8px;align-items:center;margin-top:16px;font-size:.9rem">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.currentTarget.checked)} disabled={!b.email} />
        Email the customer about status changes{!b.email && ' (no email on file)'}
      </label>

      <div class="drawer-actions">
        {b.status !== 'confirmed' && b.status !== 'completed' && <button class="btn btn-primary btn-sm" disabled={busy} onClick={() => save({ status: 'confirmed' }, 'Booking confirmed')}>Confirm</button>}
        {b.status !== 'completed' && b.status !== 'cancelled' && <button class="btn btn-outline btn-sm" disabled={busy} onClick={() => save({ status: 'completed' }, 'Marked completed')}>Mark completed</button>}
        {b.status !== 'cancelled' && <button class="btn btn-danger btn-sm" disabled={busy} onClick={() => confirm('Cancel this booking?') && save({ status: 'cancelled' }, 'Booking cancelled')}>Cancel booking</button>}
        <button class="btn btn-outline btn-sm" disabled={busy} onClick={() => save({}, 'Note saved')}>Save note</button>
      </div>
    </Modal>
  );
}
