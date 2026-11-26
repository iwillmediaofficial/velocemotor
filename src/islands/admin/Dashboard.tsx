import { useEffect, useState } from 'preact/hooks';
import { must, sb, todayIST } from './lib';
import { Loading } from './ui';
import { BookingTable, type BookingListRow } from './Bookings';

const COLS = 'id,ref,name,phone,email,vehicle,vehicle_type,quoted_price,booking_date,slot,status,notes,admin_note,created_at,service_id,services(name),products(name)';

export default function Dashboard({ onChange }: { onChange: () => void }) {
  const [data, setData] = useState<{
    today: number; pending: number; enquiries: number; products: number; samples: number;
    requests: BookingListRow[]; upcoming: BookingListRow[];
  } | null>(null);

  const load = async () => {
    const t = todayIST();
    const [today, pending, enq, prods, requests, upcoming] = await Promise.all([
      sb().from('bookings').select('id', { count: 'exact', head: true }).eq('booking_date', t).in('status', ['confirmed', 'rescheduled', 'completed']),
      sb().from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      sb().from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      sb().from('products').select('id,images').eq('is_active', true),
      // first come, first served
      sb().from('bookings').select(COLS).eq('status', 'pending').gte('booking_date', t).order('created_at').limit(10),
      sb().from('bookings').select(COLS).in('status', ['confirmed', 'rescheduled']).gte('booking_date', t).order('booking_date').order('slot').limit(10),
    ]);
    const products = must(prods) as { images: unknown[] }[];
    setData({
      today: today.count ?? 0, pending: pending.count ?? 0, enquiries: enq.count ?? 0,
      products: products.length, samples: products.filter((p) => !p.images.length).length,
      requests: must(requests) as unknown as BookingListRow[],
      upcoming: must(upcoming) as unknown as BookingListRow[],
    });
  };
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;
  const changed = () => { load(); onChange(); };

  return (
    <>
      <div class="stats">
        <a class="stat" href="#/bookings"><small>Requests to confirm</small><b style="color:var(--warn)">{data.pending}</b></a>
        <a class="stat" href="#/bookings"><small>Confirmed today</small><b>{data.today}</b></a>
        <a class="stat" href="#/enquiries"><small>New enquiries</small><b style="color:var(--volt-500)">{data.enquiries}</b></a>
        <a class="stat" href="#/products"><small>Active products</small><b>{data.products}</b></a>
      </div>

      <h2 style="margin-bottom:4px;font-size:1.2rem">Requests waiting for confirmation</h2>
      <p class="muted" style="font-size:.85rem;margin-bottom:12px">Oldest first. A request only holds the time once you confirm it; the customer is emailed when you do.</p>
      <BookingTable rows={data.requests} onChanged={changed} />

      <h2 style="margin:28px 0 12px;font-size:1.2rem">Upcoming confirmed bookings</h2>
      <BookingTable rows={data.upcoming} onChanged={changed} />

      {data.samples > 0 && <div class="note" style="margin-top:20px">{data.samples} product{data.samples > 1 ? 's' : ''} still show a <b>sample image</b>. Upload real photos in Products.</div>}
    </>
  );
}
