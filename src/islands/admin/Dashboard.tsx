import { useEffect, useState } from 'preact/hooks';
import { must, sb, todayIST } from './lib';
import { Loading } from './ui';
import { BookingTable, type BookingListRow } from './Bookings';

export default function Dashboard({ onChange }: { onChange: () => void }) {
  const [data, setData] = useState<{ today: number; pending: number; enquiries: number; products: number; samples: number; upcoming: BookingListRow[] } | null>(null);

  const load = async () => {
    const t = todayIST();
    const [today, pending, enq, prods, upcoming] = await Promise.all([
      sb().from('bookings').select('id', { count: 'exact', head: true }).eq('booking_date', t).neq('status', 'cancelled'),
      sb().from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      sb().from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      sb().from('products').select('id,images').eq('is_active', true),
      sb().from('bookings').select('id,ref,name,phone,email,vehicle,booking_date,slot,status,notes,admin_note,created_at,service_id,services(name),products(name)')
        .gte('booking_date', t).in('status', ['pending', 'confirmed', 'rescheduled']).order('booking_date').order('slot').limit(10),
    ]);
    const products = must(prods) as { images: unknown[] }[];
    setData({
      today: today.count ?? 0, pending: pending.count ?? 0, enquiries: enq.count ?? 0,
      products: products.length, samples: products.filter((p) => !p.images.length).length,
      upcoming: must(upcoming) as unknown as BookingListRow[],
    });
  };
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;

  return (
    <>
      <div class="stats">
        <a class="stat" href="#/bookings"><small>Today's bookings</small><b>{data.today}</b></a>
        <a class="stat" href="#/bookings"><small>Pending confirmation</small><b style="color:var(--warn)">{data.pending}</b></a>
        <a class="stat" href="#/enquiries"><small>New enquiries</small><b style="color:var(--volt-500)">{data.enquiries}</b></a>
        <a class="stat" href="#/products"><small>Active products</small><b>{data.products}</b></a>
      </div>
      <h2 style="margin-bottom:12px;font-size:1.2rem">Upcoming bookings</h2>
      <BookingTable rows={data.upcoming} onChanged={() => { load(); onChange(); }} />
      {data.samples > 0 && <div class="note" style="margin-top:20px">{data.samples} product{data.samples > 1 ? 's' : ''} still show a <b>sample image</b>. Upload real photos in Products.</div>}
    </>
  );
}
