import { useEffect, useState } from 'preact/hooks';
import { ago, errMsg, must, sb } from './lib';
import { Empty, Loading, useToast } from './ui';

interface Row { id: string; name: string; phone: string; email: string | null; message: string; status: string; created_at: string; products: { name: string } | null }
const PAGE = 25;

export default function Enquiries({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = async () => {
    let q = sb().from('enquiries').select('id,name,phone,email,message,status,created_at,products(name)', { count: 'exact' }).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const res = await q.range(page * PAGE, page * PAGE + PAGE - 1);
    setRows(must(res) as unknown as Row[]); setTotal(res.count ?? 0);
  };
  useEffect(() => { load(); }, [status, page]);

  const setRowStatus = async (id: string, s: string) => {
    try { must(await sb().from('enquiries').update({ status: s }).eq('id', id).select('id')); toast(`Marked ${s}`); load(); onChange(); }
    catch (e) { toast(errMsg(e), 'bad'); }
  };
  const remove = async (id: string) => {
    if (!confirm('Delete this enquiry permanently?')) return;
    try { must(await sb().from('enquiries').delete().eq('id', id).select('id')); toast('Enquiry deleted'); load(); onChange(); }
    catch (e) { toast(errMsg(e), 'bad'); }
  };

  return (
    <>
      <div class="atools">
        <select class="input" aria-label="Status" value={status} onChange={(e) => { setPage(0); setStatus(e.currentTarget.value); }}>
          <option value="">All</option><option value="new">New</option><option value="replied">Replied</option><option value="closed">Closed</option>
        </select>
      </div>
      {!rows ? <Loading /> : !rows.length ? <Empty>No enquiries.</Empty> : (
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>From</th><th>Product</th><th>Message</th><th>Received</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((e) => {
                const p10 = e.phone.replace(/\D/g, '').slice(-10);
                return (
                  <tr>
                    <td><b>{e.name}</b><br /><small class="muted">{e.phone}{e.email ? ` · ${e.email}` : ''}</small></td>
                    <td>{e.products?.name ?? 'General'}</td>
                    <td style="max-width:360px;white-space:pre-wrap">{e.message}</td>
                    <td style="white-space:nowrap">{ago(e.created_at)}</td>
                    <td>
                      <select class="input" style="padding:.35rem .5rem" aria-label="Status" value={e.status} onChange={(ev) => setRowStatus(e.id, ev.currentTarget.value)}>
                        <option value="new">new</option><option value="replied">replied</option><option value="closed">closed</option>
                      </select>
                    </td>
                    <td style="white-space:nowrap">
                      <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href={`https://wa.me/91${p10}`}>WhatsApp</a>{' '}
                      <a class="btn btn-outline btn-sm" href={`tel:+91${p10}`}>Call</a>{' '}
                      <button class="btn btn-sm" style="color:var(--danger)" onClick={() => remove(e.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div class="pager">
          <button class="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span class="muted">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
          <button class="btn btn-outline btn-sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </>
  );
}
