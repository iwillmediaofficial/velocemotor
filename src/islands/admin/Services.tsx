import { useEffect, useState } from 'preact/hooks';
import { errMsg, must, sb } from './lib';
import { Loading, Switch, useToast } from './ui';

interface Row { id: string; name: string; description: string; price_from: number; duration_min: number; is_bookable: boolean; is_active: boolean; sort: number }

export default function Services({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<Row>>>({});

  const load = async () => setRows(must(await sb().from('services').select('*').order('sort')) as Row[]);
  useEffect(() => { load(); }, []);

  const edit = (id: string, patch: Partial<Row>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const save = async (id: string, patch: Partial<Row>) => {
    try {
      must(await sb().from('services').update(patch).eq('id', id).select('id'));
      setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
      toast('Saved. Click "Publish changes" to update the website.');
      await load(); onChange();
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  if (!rows) return <Loading />;
  return (
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>Service</th><th>Price from (₹)</th><th>Duration (min)</th><th>Description</th><th>Online booking</th><th>Shown</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const d = { ...s, ...draft[s.id] };
            return (
              <tr>
                <td><input class="input" aria-label="Name" value={d.name} onInput={(e) => edit(s.id, { name: e.currentTarget.value })} /></td>
                <td><input class="input" type="number" min={0} style="width:110px" aria-label="Price" value={d.price_from} onInput={(e) => edit(s.id, { price_from: Number(e.currentTarget.value) })} /></td>
                <td><input class="input" type="number" min={5} style="width:90px" aria-label="Duration" value={d.duration_min} onInput={(e) => edit(s.id, { duration_min: Number(e.currentTarget.value) })} /></td>
                <td><textarea class="input" style="min-height:64px;min-width:280px" aria-label="Description" value={d.description} onInput={(e) => edit(s.id, { description: e.currentTarget.value })} /></td>
                <td><Switch label="Bookable online" checked={s.is_bookable} onChange={(v) => save(s.id, { is_bookable: v })} /></td>
                <td><Switch label="Shown on website" checked={s.is_active} onChange={(v) => save(s.id, { is_active: v })} /></td>
                <td>{draft[s.id] && <button class="btn btn-primary btn-sm" onClick={() => save(s.id, draft[s.id])}>Save</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
