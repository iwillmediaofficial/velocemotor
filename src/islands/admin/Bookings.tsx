import { useEffect, useState } from 'preact/hooks';
import { adminApi, ago, errMsg, must, sb, todayIST } from './lib';
import { Empty, Loading, Modal, Status, useToast } from './ui';
import { fmtDate, fmtTime, inr } from '../../lib/format';
import { BOOKING_STATUSES, vehicleTypeLabel } from '../../lib/schemas';

export interface BookingListRow {
  id: string; ref: string; name: string; phone: string; email: string | null; vehicle: string; vehicle_type: string | null; quoted_price: number | null;
  booking_date: string; slot: string; status: string; notes: string | null; admin_note: string | null; created_at: string;
  service_id: string; services: { name: string } | null; products: { name: string } | null;
}

/** Bookings that occupy a slot. Pending requests never block; they queue first-come-first-served. */
const BLOCKING = ['confirmed', 'rescheduled', 'completed'];
const isBlocking = (s: string) => BLOCKING.includes(s);

const COLS = 'id,ref,name,phone,email,vehicle,vehicle_type,quoted_price,booking_date,slot,status,notes,admin_note,created_at,service_id,services(name),products(name)';
const PAGE = 25;

/* ---------- slot queue (who asked first for each date + time) ---------- */
interface QueueEntry { id: string; ref: string; name: string; status: string; created_at: string }
export interface SlotInfo { requests: QueueEntry[]; taken: number; capacity: number }
type Queue = Record<string, SlotInfo>;
const key = (d: string, s: string) => `${d} ${s}`;

/** One query: every non-cancelled booking on the dates shown, grouped by slot and ordered by arrival time. */
export async function loadQueue(rows: { booking_date: string }[]): Promise<Queue> {
  const dates = [...new Set(rows.map((r) => r.booking_date))];
  if (!dates.length) return {};
  const [list, settings] = await Promise.all([
    sb().from('bookings').select('id,ref,name,status,booking_date,slot,created_at').in('booking_date', dates).neq('status', 'cancelled').order('created_at'),
    sb().from('settings').select('slot_capacity').eq('id', 1).single(),
  ]);
  const capacity = (must(settings) as { slot_capacity: number }).slot_capacity;
  const q: Queue = {};
  for (const b of must(list) as (QueueEntry & { booking_date: string; slot: string })[]) {
    const k = key(b.booking_date, b.slot);
    q[k] ??= { requests: [], taken: 0, capacity };
    if (isBlocking(b.status)) q[k].taken++;
    if (b.status === 'pending') q[k].requests.push(b);
  }
  return q;
}

function QueueCell({ b, info }: { b: BookingListRow; info?: SlotInfo }) {
  if (!info) return <span class="muted">—</span>;
  const full = info.taken >= info.capacity;
  if (b.status === 'pending') {
    const pos = info.requests.findIndex((r) => r.id === b.id) + 1;
    return (
      <span>
        <b class={pos === 1 ? 'q-first' : ''}>#{pos}</b> of {info.requests.length} request{info.requests.length > 1 ? 's' : ''}
        <br /><small class={full ? 'q-full' : 'muted'}>{full ? 'Slot already full' : `${info.taken}/${info.capacity} confirmed`}</small>
      </span>
    );
  }
  if (isBlocking(b.status) && info.requests.length) return <small class="muted">{info.requests.length} waiting</small>;
  return <span class="muted">—</span>;
}

/* ---------- page ---------- */
export default function Bookings({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<BookingListRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [f, setF] = useState({ status: 'pending', date: '', q: '', upcoming: false });

  const load = async () => {
    let q = sb().from('bookings').select(COLS, { count: 'exact' });
    if (f.status) q = q.eq('status', f.status);
    if (f.date) q = q.eq('booking_date', f.date);
    if (f.upcoming) q = q.gte('booking_date', todayIST());
    const term = f.q.trim().replace(/[%,()]/g, '');
    if (term) q = q.or(`ref.ilike.%${term}%,name.ilike.%${term}%,phone.ilike.%${term}%,vehicle.ilike.%${term}%`);
    // Requests: oldest first (first come, first served). Otherwise by appointment or newest.
    q = f.status === 'pending' ? q.order('created_at') : f.upcoming ? q.order('booking_date').order('slot') : q.order('created_at', { ascending: false });
    const res = await q.range(page * PAGE, page * PAGE + PAGE - 1);
    setRows(must(res) as unknown as BookingListRow[]);
    setTotal(res.count ?? 0);
  };
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [f, page]);

  const set = (patch: Partial<typeof f>) => { setPage(0); setF((cur) => ({ ...cur, ...patch })); };

  return (
    <>
      <div class="atools">
        <div class="chips" role="group" aria-label="Quick filters">
          <button class="chip" aria-pressed={f.status === 'pending'} onClick={() => set({ status: 'pending', upcoming: false })}>Requests to confirm</button>
          <button class="chip" aria-pressed={f.status === 'confirmed' && f.upcoming} onClick={() => set({ status: 'confirmed', upcoming: true })}>Upcoming confirmed</button>
          <button class="chip" aria-pressed={!f.status && !f.upcoming} onClick={() => set({ status: '', upcoming: false })}>All</button>
        </div>
        <input class="input" type="search" placeholder="Search ref, name, phone, vehicle…" aria-label="Search bookings" value={f.q} onInput={(e) => set({ q: e.currentTarget.value })} />
        <select class="input" aria-label="Status" value={f.status} onChange={(e) => set({ status: e.currentTarget.value })}>
          <option value="">All statuses</option>{BOOKING_STATUSES.map((s) => <option value={s}>{s}</option>)}
        </select>
        <input class="input" type="date" aria-label="Date" value={f.date} onChange={(e) => set({ date: e.currentTarget.value })} />
        <label style="display:flex;gap:6px;align-items:center;font-size:.9rem"><input type="checkbox" checked={f.upcoming} onChange={(e) => set({ upcoming: e.currentTarget.checked })} /> Upcoming only</label>
      </div>
      {f.status === 'pending' && <p class="muted" style="font-size:.85rem;margin:-6px 0 12px">Requests do not hold a slot until you confirm them. They are listed in the order they arrived; #1 asked first for that time.</p>}
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue>({});
  useEffect(() => { loadQueue(rows).then(setQueue).catch(() => setQueue({})); }, [rows]);

  if (!rows.length) return <Empty>No bookings found.</Empty>;
  return (
    <>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Ref</th><th>Customer</th><th>Service</th><th>Date & time</th><th>Slot queue</th><th>Received</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr class="click" tabIndex={0} onClick={() => setOpenId(b.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(b.id)}>
                <td><b>{b.ref}</b></td>
                <td>{b.name}<br /><small class="muted">{b.phone} · {[vehicleTypeLabel(b.vehicle_type), b.vehicle].filter(Boolean).join(': ')}</small></td>
                <td>{b.services?.name ?? b.service_id}{b.quoted_price != null && <><br /><small class="muted">{inr(b.quoted_price)}</small></>}</td>
                <td>{fmtDate(b.booking_date)}<br /><small class="muted">{fmtTime(b.slot)}</small></td>
                <td><QueueCell b={b} info={queue[key(b.booking_date, b.slot)]} /></td>
                <td style="white-space:nowrap"><small>{ago(b.created_at)}</small></td>
                <td><Status s={b.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId && <BookingModal id={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} onSaved={() => { setOpenId(null); onChanged(); }} />}
    </>
  );
}

/* ---------- detail ---------- */
function BookingModal({ id, onOpen, onClose, onSaved }: { id: string; onOpen: (id: string) => void; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [b, setB] = useState<BookingListRow | null>(null);
  const [info, setInfo] = useState<SlotInfo | undefined>();
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [row, s] = await Promise.all([
        sb().from('bookings').select(COLS).eq('id', id).single(),
        sb().from('settings').select('slots').eq('id', 1).single(),
      ]);
      const r = must(row) as unknown as BookingListRow;
      setB(r); setNote(r.admin_note ?? ''); setDate(r.booking_date); setSlot(r.slot);
      setSlots([...new Set([...((s.data?.slots as string[]) ?? []), r.slot])].sort());
      setInfo((await loadQueue([r]))[key(r.booking_date, r.slot)]);
    })().catch((e) => toast(errMsg(e), 'bad'));
  }, [id]);

  if (!b) return <Modal title="Booking" onClose={onClose}><Loading /></Modal>;

  const save = async (patch: Record<string, unknown>, label: string) => {
    setBusy(true);
    try {
      const r = await adminApi<{ emailed: boolean }>(`/bookings/${b.id}`, { method: 'POST', json: { ...patch, admin_note: note, notify } });
      toast(`${label}.${r.emailed ? ` Email sent to ${b.email}.` : ''}`);
      onSaved();
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };
  const phone10 = b.phone.replace(/\D/g, '').slice(-10);
  const full = info ? info.taken >= info.capacity : false;
  const pos = info ? info.requests.findIndex((r) => r.id === b.id) + 1 : 0;
  const earlier = info && pos > 1 ? info.requests.slice(0, pos - 1) : [];

  return (
    <Modal title={`Booking ${b.ref}`} onClose={onClose}>
      {b.status === 'pending' && info && (
        <div class={`alert ${full ? 'bad' : earlier.length ? 'info' : 'ok'}`} style="margin-bottom:16px">
          {full
            ? <>This time is <b>already full</b> ({info.taken}/{info.capacity} confirmed). Reschedule this request to another time or cancel it.</>
            : earlier.length
              ? <>This is request <b>#{pos} of {info.requests.length}</b> for this time. {earlier.length === 1 ? 'Someone' : `${earlier.length} people`} asked earlier. First come, first served: consider confirming #1 first.</>
              : <>This is the <b>first request</b> for this time{info.requests.length > 1 ? ` (${info.requests.length - 1} more waiting)` : ''}. {info.capacity - info.taken} place{info.capacity - info.taken === 1 ? '' : 's'} free.</>}
        </div>
      )}

      <dl class="kv">
        <dt>Status</dt><dd><Status s={b.status} /></dd>
        <dt>Service</dt><dd>{b.services?.name ?? b.service_id}</dd>
        <dt>Quoted price</dt><dd>{b.quoted_price != null ? <>{inr(b.quoted_price)} <small class="muted">(price shown to the customer when booking)</small></> : '—'}</dd>
        <dt>Requested time</dt><dd>{fmtDate(b.booking_date)} · {fmtTime(b.slot)}</dd>
        <dt>Received</dt><dd>{new Date(b.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} ({ago(b.created_at)})</dd>
        <dt>Customer</dt><dd>{b.name}</dd>
        <dt>Phone</dt><dd><a href={`tel:+91${phone10}`}>{b.phone}</a> · <a target="_blank" rel="noopener" style="color:var(--wa)" href={`https://wa.me/91${phone10}`}>WhatsApp</a></dd>
        <dt>Email</dt><dd>{b.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : '—'}</dd>
        <dt>Vehicle</dt><dd>{b.vehicle_type && <span class="st confirmed" style="margin-right:6px">{vehicleTypeLabel(b.vehicle_type)}</span>}{b.vehicle}</dd>
        {b.products && <><dt>Product</dt><dd>{b.products.name}</dd></>}
        <dt>Customer notes</dt><dd style="white-space:pre-wrap">{b.notes || '—'}</dd>
      </dl>

      {info && info.requests.length > 1 && (
        <div style="margin-top:16px">
          <span class="label-sm">Requests for this time (first come, first served)</span>
          <ol class="queue">
            {info.requests.map((r) => (
              <li class={r.id === b.id ? 'me' : ''}>
                {r.id === b.id ? <b>{r.name} (this one)</b> : <button type="button" class="linkish" onClick={() => onOpen(r.id)}>{r.name}</button>}
                <small class="muted"> · {r.ref} · {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div class="field" style="margin-top:18px"><label for="bk-note">Internal note (not sent to customer)</label><textarea id="bk-note" class="input" style="min-height:70px" value={note} onInput={(e) => setNote(e.currentTarget.value)} /></div>

      <details style="margin-top:14px" open={b.status === 'pending' && full}>
        <summary style="cursor:pointer;font-weight:600;font-size:.9rem">Reschedule (confirms the new time)</summary>
        <div class="form-grid" style="margin-top:10px">
          <input class="input" type="date" aria-label="New date" min={todayIST()} value={date} onChange={(e) => setDate(e.currentTarget.value)} />
          <select class="input" aria-label="New time" value={slot} onChange={(e) => setSlot(e.currentTarget.value)}>{slots.map((s) => <option value={s}>{fmtTime(s)}</option>)}</select>
        </div>
        <button class="btn btn-outline btn-sm" style="margin-top:10px" disabled={busy || (date === b.booking_date && slot === b.slot)} onClick={() => save({ date, slot }, 'Rescheduled and confirmed')}>Save new time</button>
      </details>

      <label style="display:flex;gap:8px;align-items:center;margin-top:16px;font-size:.9rem">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.currentTarget.checked)} disabled={!b.email} />
        Email the customer (confirmation, new time, completion or cancellation){!b.email && ' (no email on file)'}
      </label>

      <div class="drawer-actions">
        {(b.status === 'pending' || b.status === 'cancelled') && (
          <button class="btn btn-primary btn-sm" disabled={busy || full} title={full ? 'This time is full' : ''} onClick={() => save({ status: 'confirmed' }, 'Booking confirmed')}>Confirm this time</button>
        )}
        {isBlocking(b.status) && b.status !== 'completed' && <button class="btn btn-outline btn-sm" disabled={busy} onClick={() => save({ status: 'completed' }, 'Marked completed')}>Mark completed</button>}
        {b.status !== 'cancelled' && <button class="btn btn-danger btn-sm" disabled={busy} onClick={() => confirm(b.status === 'pending' ? 'Decline this request?' : 'Cancel this booking?') && save({ status: 'cancelled' }, b.status === 'pending' ? 'Request declined' : 'Booking cancelled')}>{b.status === 'pending' ? 'Decline request' : 'Cancel booking'}</button>}
        <button class="btn btn-outline btn-sm" disabled={busy} onClick={() => save({}, 'Note saved')}>Save note</button>
      </div>
    </Modal>
  );
}
