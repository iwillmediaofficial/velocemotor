import { useEffect, useState } from 'preact/hooks';
import { errMsg, must, sb } from './lib';
import { Loading, useToast } from './ui';
import type { Segment, Vehicle } from '../../lib/types';
import { slugify } from '../../lib/format';

export default function Vehicles({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<(Vehicle & { product_fitment: { count: number }[] })[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [form, setForm] = useState({ brand: '', model: '', segment_id: '' });

  const load = async () => {
    const [v, s] = await Promise.all([
      sb().from('vehicles').select('*,product_fitment(count)').order('sort').order('brand').order('model'),
      sb().from('segments').select('*').order('sort'),
    ]);
    setRows(must(v) as never); setSegments(must(s) as Segment[]);
  };
  useEffect(() => { load(); }, []);

  const add = async (e: Event) => {
    e.preventDefault();
    const brand = form.brand.trim(), model = form.model.trim();
    if (!brand || !model) return toast('Enter brand and model', 'bad');
    try {
      must(await sb().from('vehicles').insert({ id: slugify(`${brand} ${model}`), brand, model, segment_id: form.segment_id || null, sort: (rows?.length ?? 0) + 1 }).select('id'));
      setForm({ brand: '', model: '', segment_id: form.segment_id });
      toast(`${brand} ${model} added. Link it to products in the product editor.`);
      await load(); onChange();
    } catch (e2) { toast(errMsg(e2).includes('duplicate') ? 'That vehicle already exists.' : errMsg(e2), 'bad'); }
  };
  const remove = async (v: Vehicle) => {
    if (!confirm(`Delete ${v.brand} ${v.model}? It will be unlinked from all products.`)) return;
    try { must(await sb().from('vehicles').delete().eq('id', v.id).select('id')); toast('Vehicle deleted'); await load(); onChange(); }
    catch (e) { toast(errMsg(e), 'bad'); }
  };

  if (!rows) return <Loading />;
  const brands = [...new Set(rows.map((r) => r.brand))];
  return (
    <>
      <form class="panel atools" style="align-items:end;padding:18px" onSubmit={add}>
        <div class="field"><label for="v-brand">Brand</label><input id="v-brand" class="input" list="v-brands" value={form.brand} onInput={(e) => setForm({ ...form, brand: e.currentTarget.value })} /><datalist id="v-brands">{brands.map((b) => <option value={b} />)}</datalist></div>
        <div class="field"><label for="v-model">Model</label><input id="v-model" class="input" value={form.model} onInput={(e) => setForm({ ...form, model: e.currentTarget.value })} /></div>
        <div class="field"><label for="v-seg">Segment</label><select id="v-seg" class="input" value={form.segment_id} onChange={(e) => setForm({ ...form, segment_id: e.currentTarget.value })}><option value="">—</option>{segments.filter((s) => s.id !== 'care').map((s) => <option value={s.id}>{s.name}</option>)}</select></div>
        <button class="btn btn-primary btn-sm">+ Add vehicle</button>
      </form>
      <div class="tbl-wrap" style="margin-top:16px">
        <table class="tbl">
          <thead><tr><th>Brand</th><th>Model</th><th>Segment</th><th>Linked products</th><th></th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr>
                <td>{v.brand}</td><td><b>{v.model}</b></td>
                <td>{segments.find((s) => s.id === v.segment_id)?.name ?? '—'}</td>
                <td>{v.product_fitment[0]?.count ?? 0}</td>
                <td><button class="btn btn-sm" style="color:var(--danger)" onClick={() => remove(v)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
