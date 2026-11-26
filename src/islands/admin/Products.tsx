import { useEffect, useState } from 'preact/hooks';
import { deleteImage, errMsg, must, sb, uploadImage } from './lib';
import { Empty, Loading, Modal, Switch, useToast } from './ui';
import type { ProductImage, Segment, Spec, Vehicle } from '../../lib/types';
import { inr, slugify } from '../../lib/format';
import { imgUrl } from '../../lib/media';
import { productArt } from '../../lib/art';

interface Row {
  id: string; slug: string; name: string; segment_id: string; position: string | null; short_desc: string; description: string;
  specs: Spec[]; price: number; mrp: number; sku: string | null; images: ProductImage[]; is_active: boolean; is_featured: boolean; show_fitting: boolean; sort: number;
  product_fitment: { vehicle_id: string }[];
}
const POSITIONS = ['', 'Front', 'Rear', 'Rear pair', 'Front & rear'];

export default function Products({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  const load = async () => {
    const [p, s, v] = await Promise.all([
      sb().from('products').select('*,product_fitment(vehicle_id)').order('sort').order('name'),
      sb().from('segments').select('*').order('sort'),
      sb().from('vehicles').select('*').order('sort').order('brand'),
    ]);
    setRows(must(p) as Row[]); setSegments(must(s) as Segment[]); setVehicles(must(v) as Vehicle[]);
  };
  useEffect(() => { load(); }, []);

  const patch = async (id: string, values: Partial<Row>) => {
    try { must(await sb().from('products').update(values).eq('id', id).select('id')); await load(); onChange(); }
    catch (e) { toast(errMsg(e), 'bad'); }
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete "${r.name}" permanently? Its photos will be deleted too. To hide it instead, switch "Active" off.`)) return;
    try {
      must(await sb().from('products').delete().eq('id', r.id).select('id'));
      await Promise.all(r.images.map((im) => deleteImage(im.id)));
      toast('Product deleted');
      await load(); onChange();
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  if (!rows) return <Loading />;
  const term = q.toLowerCase();
  const list = rows.filter((r) => !term || r.name.toLowerCase().includes(term) || r.slug.includes(term));
  const segName = (id: string) => segments.find((s) => s.id === id)?.name ?? id;

  return (
    <>
      <div class="atools">
        <input class="input" type="search" placeholder="Search products…" aria-label="Search products" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <span style="flex:1" />
        <button class="btn btn-primary btn-sm" onClick={() => setEditing('new')}>+ Add product</button>
      </div>
      {!list.length ? <Empty>No products.</Empty> : (
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th></th><th>Name</th><th>Segment</th><th>Price</th><th>Fits</th><th>Featured</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr>
                  <td><div class="thumb">{r.images[0] ? <img src={imgUrl(r.images[0], 480)} alt="" /> : <span class="art" dangerouslySetInnerHTML={{ __html: productArt({ slug: r.slug, name: r.name, seg: r.segment_id, pos: r.position }) }} />}</div></td>
                  <td><b>{r.name}</b>{!r.images.length && <><br /><small style="color:var(--warn)">Sample image</small></>}</td>
                  <td>{segName(r.segment_id)}</td>
                  <td>{inr(r.price)}{Number(r.mrp) > Number(r.price) && <><br /><small class="muted"><s>{inr(r.mrp)}</s></small></>}</td>
                  <td>{r.product_fitment.length}</td>
                  <td><Switch label="Featured" checked={r.is_featured} onChange={(v) => patch(r.id, { is_featured: v })} /></td>
                  <td><Switch label="Active" checked={r.is_active} onChange={(v) => patch(r.id, { is_active: v })} /></td>
                  <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onClick={() => setEditing(r)}>Edit</button>{' '}<button class="btn btn-sm" style="color:var(--danger)" onClick={() => remove(r)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ProductEditor
          row={editing === 'new' ? null : editing} segments={segments} vehicles={vehicles} nextSort={Math.max(0, ...rows.map((r) => r.sort)) + 1}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); onChange(); toast('Saved'); }}
        />
      )}
    </>
  );
}

function ProductEditor({ row, segments, vehicles, nextSort, onClose, onSaved }: {
  row: Row | null; segments: Segment[]; vehicles: Vehicle[]; nextSort: number; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    name: row?.name ?? '', slug: row?.slug ?? '', segment_id: row?.segment_id ?? segments[0]?.id ?? '', position: row?.position ?? '',
    short_desc: row?.short_desc ?? '', description: row?.description ?? '', price: row ? String(row.price) : '', mrp: row ? String(row.mrp) : '',
    sku: row?.sku ?? '', is_active: row?.is_active ?? true, is_featured: row?.is_featured ?? false, show_fitting: row?.show_fitting ?? true, sort: row?.sort ?? nextSort,
  });
  const [specs, setSpecs] = useState<Spec[]>(row?.specs?.length ? row.specs : [{ label: '', value: '' }]);
  const [fits, setFits] = useState<string[]>(row?.product_fitment.map((f) => f.vehicle_id) ?? []);
  const [images, setImages] = useState<ProductImage[]>(row?.images ?? []);
  const [uploadedNow, setUploadedNow] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((cur) => ({ ...cur, ...patch }));

  const close = () => {
    // clean up photos uploaded in this editor session that were never saved
    uploadedNow.forEach((id) => deleteImage(id));
    onClose();
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const r = await uploadImage(file);
        setImages((imgs) => [...imgs, { id: r.id, w: r.w, h: r.h, alt: v.name || file.name.replace(/\.[^.]+$/, '') }]);
        setUploadedNow((u) => [...u, r.id]);
        toast(`${file.name}: ${Math.round(file.size / 1024)} KB → ${r.kb.join(' / ')} KB (WebP)`, 'info');
      } catch (e) { toast(`${file.name}: ${errMsg(e)}`, 'bad'); }
      finally { setUploading((n) => n - 1); }
    }
  };
  const move = (i: number, d: number) => setImages((imgs) => { const a = [...imgs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  const save = async (e: Event) => {
    e.preventDefault();
    const slug = v.slug || slugify(v.name);
    const err: Record<string, string> = {};
    if (v.name.trim().length < 2) err.name = 'Name is required';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) err.slug = 'Use lowercase letters, numbers and dashes';
    if (v.price === '' || Number(v.price) < 0) err.price = 'Enter a price';
    if (v.mrp === '' || Number(v.mrp) < Number(v.price)) err.mrp = 'MRP must be at least the price';
    setErrors(err);
    if (Object.keys(err).length) return;

    setBusy(true);
    const values = {
      name: v.name.trim(), slug, segment_id: v.segment_id, position: v.position || null, short_desc: v.short_desc.trim(), description: v.description.trim(),
      price: Number(v.price), mrp: Number(v.mrp), sku: v.sku.trim() || null, is_active: v.is_active, is_featured: v.is_featured, show_fitting: v.show_fitting, sort: Number(v.sort) || 0,
      specs: specs.filter((s) => s.label.trim() && s.value.trim()).map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
      images: images.map((im) => ({ ...im, alt: im.alt.trim() || v.name.trim() })),
    };
    try {
      let id = row?.id;
      if (id) must(await sb().from('products').update(values).eq('id', id).select('id'));
      else id = (must(await sb().from('products').insert(values).select('id').single()) as { id: string }).id;

      const before = row?.product_fitment.map((f) => f.vehicle_id) ?? [];
      const add = fits.filter((x) => !before.includes(x));
      const del = before.filter((x) => !fits.includes(x));
      if (del.length) must(await sb().from('product_fitment').delete().eq('product_id', id).in('vehicle_id', del).select('product_id'));
      if (add.length) must(await sb().from('product_fitment').insert(add.map((vehicle_id) => ({ product_id: id, vehicle_id }))).select('product_id'));

      // photos removed from a saved product → delete them from storage
      const removed = (row?.images ?? []).filter((im) => !images.some((x) => x.id === im.id));
      removed.forEach((im) => deleteImage(im.id));
      setUploadedNow([]);
      onSaved();
    } catch (e2) {
      const m = errMsg(e2);
      toast(m.includes('products_slug_key') ? 'Another product already uses this URL slug.' : m, 'bad');
    } finally { setBusy(false); }
  };

  const brands = [...new Set(vehicles.map((x) => x.brand))];
  const inp = (k: keyof typeof v, extra: Record<string, unknown> = {}) => ({
    id: `p-${k}`, class: 'input', value: v[k] as string, 'aria-invalid': errors[k] ? true : undefined,
    onInput: (e: Event) => set({ [k]: (e.currentTarget as HTMLInputElement).value } as Partial<typeof v>), ...extra,
  });

  return (
    <Modal title={row ? `Edit: ${row.name}` : 'Add product'} onClose={close} wide>
      <form class="form-grid" noValidate onSubmit={save}>
        <div class="field full"><label for="p-name">Name *</label><input {...inp('name')} onInput={(e) => set({ name: e.currentTarget.value, ...(row ? {} : { slug: slugify(e.currentTarget.value) }) })} /><span class="err-msg">{errors.name}</span></div>
        <div class="field"><label for="p-slug">URL (velocemotor.com/products/…)</label><input {...inp('slug')} /><span class="err-msg">{errors.slug}</span></div>
        <div class="field"><label for="p-segment_id">Segment</label>
          <select {...inp('segment_id')} onChange={(e) => set({ segment_id: e.currentTarget.value })}>{segments.map((s) => <option value={s.id}>{s.name}</option>)}</select></div>
        <div class="field"><label for="p-price">Price (₹) *</label><input {...inp('price', { type: 'number', min: 0, step: 1 })} /><span class="err-msg">{errors.price}</span></div>
        <div class="field"><label for="p-mrp">MRP (₹) *</label><input {...inp('mrp', { type: 'number', min: 0, step: 1 })} /><span class="err-msg">{errors.mrp}</span></div>
        <div class="field"><label for="p-position">Position</label>
          <select {...inp('position')} onChange={(e) => set({ position: e.currentTarget.value })}>{POSITIONS.map((p) => <option value={p}>{p || '— not applicable'}</option>)}</select></div>
        <div class="field"><label for="p-sku">SKU (optional)</label><input {...inp('sku')} /></div>
        <div class="field full" style="flex-direction:row;gap:22px;align-items:center">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" checked={v.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} /> Active (shown on website)</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" checked={v.is_featured} onChange={(e) => set({ is_featured: e.currentTarget.checked })} /> Featured on home page</label>
          <label style="display:flex;gap:8px;align-items:center" title="Shows a 'Book Fitting' button on the product page (only while the Suspension Fitting service is bookable online)"><input type="checkbox" checked={v.show_fitting} onChange={(e) => set({ show_fitting: e.currentTarget.checked })} /> Show "Book Fitting" button</label>
          <label style="display:flex;gap:8px;align-items:center">Sort order <input class="input" type="number" style="width:90px" value={v.sort} onInput={(e) => set({ sort: Number(e.currentTarget.value) })} /></label>
        </div>
        <div class="field full"><label for="p-short_desc">Short description (cards & search results)</label><input {...inp('short_desc', { maxLength: 200 })} /></div>
        <div class="field full"><label for="p-description">Full description</label><textarea {...inp('description')} /></div>

        <fieldset class="field full" style="border:0">
          <legend style="font-size:.8rem;font-weight:600;margin-bottom:6px">Specifications</legend>
          {specs.map((s, i) => (
            <div style="display:grid;grid-template-columns:1fr 1.4fr auto;gap:8px;margin-bottom:8px">
              <input class="input" placeholder="Label, e.g. Length" aria-label={`Spec ${i + 1} label`} value={s.label} onInput={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, label: e.currentTarget.value } : x)))} />
              <input class="input" placeholder="Value, e.g. 360 mm" aria-label={`Spec ${i + 1} value`} value={s.value} onInput={(e) => setSpecs(specs.map((x, j) => (j === i ? { ...x, value: e.currentTarget.value } : x)))} />
              <button type="button" class="btn btn-sm btn-outline" aria-label="Remove spec" onClick={() => setSpecs(specs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" class="btn btn-sm btn-outline" style="align-self:start" onClick={() => setSpecs([...specs, { label: '', value: '' }])}>+ Add spec</button>
        </fieldset>

        <fieldset class="field full" style="border:0">
          <legend style="font-size:.8rem;font-weight:600;margin-bottom:6px">Compatible vehicles ({fits.length})</legend>
          <div class="ms">
            {brands.map((b) => (
              <div style="width:100%">
                <small class="muted" style="font-weight:700">{b}</small>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                  {vehicles.filter((x) => x.brand === b).map((x) => (
                    <label><input type="checkbox" checked={fits.includes(x.id)} onChange={(e) => setFits(e.currentTarget.checked ? [...fits, x.id] : fits.filter((f) => f !== x.id))} />{x.model}</label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <small class="muted">Missing a bike? Add it under Vehicles.</small>
        </fieldset>

        <div class="field full">
          <span style="font-size:.8rem;font-weight:600">Photos (first photo is the main image)</span>
          <label class="uploader">
            {uploading ? `Uploading ${uploading}…` : 'Click to add photos (JPG/PNG/WebP). They are resized in your browser to 480 / 960 / 1600 px WebP before upload.'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.currentTarget.files); e.currentTarget.value = ''; }} />
          </label>
          <div class="up-list">
            {images.map((im, i) => (
              <figure>
                <img src={imgUrl(im, 480)} alt="" />
                <input class="input" style="padding:.3rem .45rem;font-size:.75rem;margin-top:4px" placeholder="Alt text" aria-label={`Photo ${i + 1} description`} value={im.alt} onInput={(e) => setImages(images.map((x, j) => (j === i ? { ...x, alt: e.currentTarget.value } : x)))} />
                <div style="display:flex;gap:4px;margin-top:4px">
                  <button type="button" class="btn btn-sm btn-outline" style="padding:.2rem .5rem" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move left">←</button>
                  <button type="button" class="btn btn-sm btn-outline" style="padding:.2rem .5rem" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Move right">→</button>
                  <button type="button" class="btn btn-sm" style="color:var(--danger);padding:.2rem .5rem" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Remove photo">Remove</button>
                </div>
              </figure>
            ))}
          </div>
        </div>

        <div class="full form-nav">
          <button type="button" class="btn btn-outline" onClick={close}>Cancel</button>
          <button class="btn btn-primary" disabled={busy || uploading > 0}>{busy ? 'Saving…' : 'Save product'}</button>
        </div>
      </form>
    </Modal>
  );
}
