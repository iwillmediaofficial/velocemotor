// Admin → Offers & Launches: the home page slider. Saving publishes automatically (like products).
import { useEffect, useState } from 'preact/hooks';
import { deleteImage, errMsg, must, sb, todayIST, uploadImage } from './lib';
import { Empty, Loading, Modal, Switch, useToast } from './ui';
import type { ProductImage, PromoKind } from '../../lib/types';
import { fmtDate, waLink } from '../../lib/format';
import { imgUrl } from '../../lib/media';
import PromoSlide, { PROMO_KINDS } from '../../components/PromoSlide';

interface Row {
  id: string; kind: PromoKind; title: string; subtitle: string; highlight: string; cta_label: string; cta_url: string;
  image: ProductImage | null; image_mobile: ProductImage | null; image_has_text: boolean;
  starts_on: string | null; ends_on: string | null; is_active: boolean; sort: number; created_at: string;
}
interface LinkOption { label: string; url: string }

/** Where the slide currently stands, from the visitor's point of view. */
function state(r: Row, today: string): { label: string; cls: string } {
  if (!r.is_active) return { label: 'Hidden', cls: 'cancelled' };
  if (r.ends_on && today > r.ends_on) return { label: 'Ended', cls: 'cancelled' };
  if (r.starts_on && today < r.starts_on) return { label: 'Scheduled', cls: 'pending' };
  return { label: 'Live', cls: 'completed' };
}
const dateRange = (r: Pick<Row, 'starts_on' | 'ends_on'>) =>
  !r.starts_on && !r.ends_on ? 'Always' : `${r.starts_on ? fmtDate(r.starts_on) : 'Now'} → ${r.ends_on ? fmtDate(r.ends_on) : 'no end'}`;

export default function Promos({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [links, setLinks] = useState<LinkOption[]>([]);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [interval, setIntervalSec] = useState(6);

  const load = async () => {
    const [p, prod, svc, set] = await Promise.all([
      sb().from('promos').select('*').order('sort').order('created_at'),
      sb().from('products').select('slug,name').eq('is_active', true).order('name'),
      sb().from('services').select('id,name').eq('is_active', true).eq('is_bookable', true).order('sort'),
      sb().from('settings').select('whatsapp,promo_interval_sec').eq('id', 1).single(),
    ]);
    setRows(must(p) as Row[]);
    const st = set.data as { whatsapp?: string; promo_interval_sec?: number } | null;
    const wa = st?.whatsapp;
    if (st?.promo_interval_sec) setIntervalSec(st.promo_interval_sec);
    setLinks([
      { label: 'Book a Service page', url: '/book' },
      { label: 'Services & Prices page', url: '/services' },
      { label: 'All products', url: '/products' },
      ...(must(svc) as { id: string; name: string }[]).map((s) => ({ label: `Book: ${s.name}`, url: `/book?service=${s.id}` })),
      ...(must(prod) as { slug: string; name: string }[]).map((x) => ({ label: `Product: ${x.name}`, url: `/products/${x.slug}` })),
      ...(wa ? [{ label: 'WhatsApp chat', url: waLink(wa, 'Hi Veloce Motor, I saw your offer on the website.') }] : []),
    ]);
  };
  useEffect(() => { load(); }, []);

  const patch = async (id: string, values: Partial<Row>) => {
    try { must(await sb().from('promos').update(values).eq('id', id).select('id')); await load(); onChange(); }
    catch (e) { toast(errMsg(e), 'bad'); }
  };
  const move = async (i: number, d: number) => {
    if (!rows) return;
    const a = [...rows]; const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setRows(a);
    try {
      // renumber everything so the order is always explicit
      await Promise.all(a.map((r, k) => (r.sort === k ? null : sb().from('promos').update({ sort: k }).eq('id', r.id).select('id').then(must))));
      await load(); onChange();
    } catch (e) { toast(errMsg(e), 'bad'); await load(); }
  };
  const saveInterval = async (secs: number) => {
    const prev = interval;
    setIntervalSec(secs);
    try {
      must(await sb().from('settings').update({ promo_interval_sec: secs }).eq('id', 1).select('id'));
      toast(`Each slide now shows for ${secs} seconds. The home page updates in a few minutes.`);
      onChange();
    } catch (e) { setIntervalSec(prev); toast(errMsg(e), 'bad'); }
  };
  const remove = async (r: Row) => {
    if (!confirm(`Delete "${r.title}" permanently? Its images will be deleted too. To hide it instead, switch "Active" off.`)) return;
    try {
      must(await sb().from('promos').delete().eq('id', r.id).select('id'));
      [r.image, r.image_mobile].forEach((im) => im && deleteImage(im.id));
      toast('Slide deleted');
      await load(); onChange();
    } catch (e) { toast(errMsg(e), 'bad'); }
  };

  if (!rows) return <Loading />;
  const today = todayIST();
  const live = rows.filter((r) => state(r, today).label === 'Live').length;

  return (
    <>
      <div class="atools">
        <p class="muted" style="font-size:.88rem">
          Slides appear on the home page, just below the main banner. <b>{live}</b> live now.
          {' '}With no live slides, the section is hidden.
        </p>
        <span style="flex:1" />
        <label style="display:flex;gap:8px;align-items:center;font-size:.88rem;white-space:nowrap" title="How long each slide stays on screen before the slider moves to the next one">
          Each slide shows for
          <select class="input" style="width:auto;padding:.4rem .6rem" value={interval} onChange={(e) => saveInterval(Number(e.currentTarget.value))}>
            {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 30].map((n) => <option value={n}>{n} seconds</option>)}
          </select>
        </label>
        <button class="btn btn-primary btn-sm" onClick={() => setEditing('new')}>+ Add slide</button>
      </div>
      {!rows.length ? <Empty>No slides yet. Add your first offer or new launch.</Empty> : (
        <div class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>Order</th><th></th><th>Slide</th><th>Type</th><th>Dates</th><th>Status</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const st = state(r, today);
                return (
                  <tr>
                    <td style="white-space:nowrap">
                      <button class="btn btn-sm btn-outline" style="padding:.2rem .5rem" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move "${r.title}" up`}>↑</button>{' '}
                      <button class="btn btn-sm btn-outline" style="padding:.2rem .5rem" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move "${r.title}" down`}>↓</button>
                    </td>
                    <td><div class="thumb" style="width:96px">{r.image ? <img src={imgUrl(r.image, 480)} alt="" /> : <span class="promo-thumb-plain" />}</div></td>
                    <td><b>{r.title}</b>{r.highlight && <><br /><small class="muted">{r.highlight}</small></>}</td>
                    <td>{PROMO_KINDS[r.kind]}</td>
                    <td style="white-space:nowrap">{dateRange(r)}</td>
                    <td><span class={`st ${st.cls}`}>{st.label}</span></td>
                    <td><Switch label="Active" checked={r.is_active} onChange={(v) => patch(r.id, { is_active: v })} /></td>
                    <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onClick={() => setEditing(r)}>Edit</button>{' '}<button class="btn btn-sm" style="color:var(--danger)" onClick={() => remove(r)}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <PromoEditor
          row={editing === 'new' ? null : editing} links={links} nextSort={rows.length ? Math.max(...rows.map((r) => r.sort)) + 1 : 0}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); onChange(); toast('Saved. The home page updates in a few minutes.'); }}
        />
      )}
    </>
  );
}

function PromoEditor({ row, links, nextSort, onClose, onSaved }: {
  row: Row | null; links: LinkOption[]; nextSort: number; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    kind: row?.kind ?? ('offer' as PromoKind), title: row?.title ?? '', subtitle: row?.subtitle ?? '', highlight: row?.highlight ?? '',
    cta_label: row?.cta_label ?? 'Book Now', cta_url: row?.cta_url ?? '/book', image_has_text: row?.image_has_text ?? false,
    starts_on: row?.starts_on ?? '', ends_on: row?.ends_on ?? '', is_active: row?.is_active ?? true,
  });
  const [image, setImage] = useState<ProductImage | null>(row?.image ?? null);
  const [imageMobile, setImageMobile] = useState<ProductImage | null>(row?.image_mobile ?? null);
  const [uploadedNow, setUploadedNow] = useState<string[]>([]);
  const [uploading, setUploading] = useState<'' | 'main' | 'mobile'>('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof v>) => setV((cur) => ({ ...cur, ...patch }));

  const close = () => { uploadedNow.forEach((id) => deleteImage(id)); onClose(); };

  const onFile = async (which: 'main' | 'mobile', files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(which);
    try {
      const r = await uploadImage(file);
      const img = { id: r.id, w: r.w, h: r.h, alt: v.title || file.name.replace(/\.[^.]+$/, '') };
      // replacing an image uploaded in this same session → remove the unused one right away
      const prev = which === 'main' ? image : imageMobile;
      if (prev && uploadedNow.includes(prev.id)) deleteImage(prev.id);
      (which === 'main' ? setImage : setImageMobile)(img);
      setUploadedNow((u) => [...u, r.id]);
    } catch (e) { toast(`${file.name}: ${errMsg(e)}`, 'bad'); }
    finally { setUploading(''); }
  };

  const save = async (e: Event) => {
    e.preventDefault();
    const url = v.cta_url.trim();
    const err: Record<string, string> = {};
    if (v.title.trim().length < 2) err.title = 'Title is required';
    if (!v.cta_label.trim()) err.cta_label = 'Button text is required';
    if (!/^(\/[^/\\]|\/$|https:\/\/)/.test(url)) err.cta_url = 'Use a page on this site (starting with /) or a full https:// link';
    if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) err.ends_on = 'End date is before the start date';
    if (v.image_has_text && !image) err.image = 'A finished banner needs an image';
    if (v.image_has_text && image && !image.alt.trim()) err.alt = 'Describe what the banner says (for Google and screen readers)';
    setErrors(err);
    if (Object.keys(err).length) return;

    setBusy(true);
    const values = {
      kind: v.kind, title: v.title.trim(), subtitle: v.subtitle.trim(), highlight: v.highlight.trim(),
      cta_label: v.cta_label.trim(), cta_url: url, image_has_text: v.image_has_text,
      image: image && { ...image, alt: image.alt.trim() || v.title.trim() },
      image_mobile: imageMobile && { ...imageMobile, alt: imageMobile.alt.trim() || image?.alt.trim() || v.title.trim() },
      starts_on: v.starts_on || null, ends_on: v.ends_on || null, is_active: v.is_active,
      ...(row ? {} : { sort: nextSort }),
    };
    try {
      if (row) must(await sb().from('promos').update(values).eq('id', row.id).select('id'));
      else must(await sb().from('promos').insert(values).select('id'));
      // images removed from a saved slide → delete them from storage
      [row?.image, row?.image_mobile].forEach((old) => {
        if (old && old.id !== image?.id && old.id !== imageMobile?.id) deleteImage(old.id);
      });
      setUploadedNow([]);
      onSaved();
    } catch (e2) { toast(errMsg(e2), 'bad'); }
    finally { setBusy(false); }
  };

  const inp = (k: keyof typeof v, extra: Record<string, unknown> = {}) => ({
    id: `pr-${k}`, class: 'input', value: v[k] as string, 'aria-invalid': errors[k] ? true : undefined,
    onInput: (e: Event) => set({ [k]: (e.currentTarget as HTMLInputElement).value } as Partial<typeof v>), ...extra,
  });
  const pickedLink = links.find((l) => l.url === v.cta_url)?.url ?? '';

  const imageBox = (which: 'main' | 'mobile', img: ProductImage | null, setImg: (i: ProductImage | null) => void) => (
    <div>
      <label class="uploader" style="min-height:0">
        {uploading === which ? 'Uploading…' : img ? 'Replace image' : 'Click to choose an image'}
        <input type="file" accept="image/*" hidden disabled={!!uploading} onChange={(e) => { onFile(which, e.currentTarget.files); e.currentTarget.value = ''; }} />
      </label>
      {img && (
        <div class="up-list" style="margin-top:8px">
          <figure style="width:100%">
            <img src={imgUrl(img, 480)} alt="" style="aspect-ratio:auto" />
            <input class="input" style="padding:.3rem .45rem;font-size:.8rem;margin-top:4px" placeholder="Describe the image" aria-label={`${which === 'main' ? 'Main' : 'Mobile'} image description`}
              value={img.alt} onInput={(e) => setImg({ ...img, alt: e.currentTarget.value })} />
            <button type="button" class="btn btn-sm" style="color:var(--danger);padding:.2rem .5rem;margin-top:4px" onClick={() => setImg(null)}>Remove image</button>
          </figure>
        </div>
      )}
    </div>
  );

  return (
    <Modal title={row ? `Edit slide: ${row.title}` : 'Add slide'} onClose={close} wide>
      <form class="form-grid" noValidate onSubmit={save}>
        <div class="field full">
          <span style="font-size:.8rem;font-weight:600">Live preview (desktop)</span>
          <div class="promo-preview">
            <PromoSlide p={{ ...v, title: v.title || 'Your offer title', cta_label: v.cta_label || 'Book Now', image, image_mobile: imageMobile }} eager />
          </div>
        </div>

        <div class="field"><label for="pr-kind">Type</label>
          <select {...inp('kind')} onChange={(e) => set({ kind: e.currentTarget.value as PromoKind })}>
            {(Object.keys(PROMO_KINDS) as PromoKind[]).map((k) => <option value={k}>{PROMO_KINDS[k]}</option>)}
          </select></div>
        <div class="field"><label for="pr-highlight">Highlight (optional)</label><input {...inp('highlight', { maxLength: 40, placeholder: 'e.g. ₹299 or 20% OFF' })} /></div>
        <div class="field full"><label for="pr-title">Title *</label><input {...inp('title', { maxLength: 80, placeholder: 'e.g. Monsoon Wash Combo' })} /><span class="err-msg">{errors.title}</span></div>
        <div class="field full"><label for="pr-subtitle">Subtitle (optional)</label><input {...inp('subtitle', { maxLength: 220, placeholder: 'e.g. Foam wash + chain lube for any bike. Valid till 15 Dec.' })} /></div>

        <div class="field"><label for="pr-cta_label">Button text *</label><input {...inp('cta_label', { maxLength: 30 })} /><span class="err-msg">{errors.cta_label}</span></div>
        <div class="field"><label for="pr-link">Button goes to</label>
          <select id="pr-link" class="input" value={pickedLink} onChange={(e) => e.currentTarget.value && set({ cta_url: e.currentTarget.value })}>
            <option value="">Custom link (type below)</option>
            {links.map((l) => <option value={l.url}>{l.label}</option>)}
          </select></div>
        <div class="field full"><label for="pr-cta_url">Link</label><input {...inp('cta_url')} /><span class="err-msg">{errors.cta_url}</span></div>

        <div class="field"><label for="pr-starts_on">Show from (optional)</label><input {...inp('starts_on', { type: 'date' })} /></div>
        <div class="field"><label for="pr-ends_on">Show until (optional, inclusive)</label><input {...inp('ends_on', { type: 'date' })} /><span class="err-msg">{errors.ends_on}</span></div>

        <div class="field full">
          <span style="font-size:.8rem;font-weight:600">Image (recommended 1600 × 600 px, main subject on the right; text is placed on the left)</span>
          {imageBox('main', image, setImage)}
          <span class="err-msg">{errors.image}{errors.alt}</span>
        </div>
        <div class="field full">
          <span style="font-size:.8rem;font-weight:600">Mobile image (optional). Finished banner: 1080 × 1350 px portrait. Other slides: 1200 × 750 px, shown above the text. Without it, phones show a crop of the main image.</span>
          {imageBox('mobile', imageMobile, setImageMobile)}
        </div>

        <div class="field full" style="flex-direction:row;gap:22px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" checked={v.is_active} onChange={(e) => set({ is_active: e.currentTarget.checked })} /> Active (shown on website)</label>
          <label style="display:flex;gap:8px;align-items:center" title="Turn on for a finished banner made in Canva or by a designer: the website shows the image only, and the whole banner is the link.">
            <input type="checkbox" checked={v.image_has_text} onChange={(e) => set({ image_has_text: e.currentTarget.checked })} /> Image already has text (finished banner)</label>
        </div>

        <div class="full form-nav">
          <button type="button" class="btn btn-outline" onClick={close}>Cancel</button>
          <button class="btn btn-primary" disabled={busy || !!uploading}>{busy ? 'Saving…' : 'Save slide'}</button>
        </div>
      </form>
    </Modal>
  );
}
