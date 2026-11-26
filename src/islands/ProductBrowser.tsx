// Products listing: search + filters run entirely in the browser over data baked into the page (no API calls).
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ProductLite, Segment, Vehicle } from '../lib/types';
import { productArt } from '../lib/art';
import { discount, inr, waLink } from '../lib/format';
import { imgUrl, srcset } from '../lib/media';
import { icons } from '../lib/icons';

interface Props { products: ProductLite[]; segments: Segment[]; vehicles: Vehicle[]; whatsapp: string }
type Filters = { q: string; seg: string; brand: string; vehicle: string; pos: string; sort: string };
const EMPTY: Filters = { q: '', seg: '', brand: '', vehicle: '', pos: '', sort: 'featured' };

export default function ProductBrowser({ products, segments, vehicles, whatsapp }: Props) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [showFilters, setShowFilters] = useState(false);

  // read initial filters from the URL (?seg=, ?brand=, ?vehicle=, ?q=)
  useEffect(() => {
    const u = new URLSearchParams(location.search);
    const vehicle = u.get('vehicle') ?? '';
    const v = vehicles.find((x) => x.id === vehicle);
    setF({ ...EMPTY, q: u.get('q') ?? '', seg: u.get('seg') ?? '', vehicle, brand: v?.brand ?? u.get('brand') ?? '' });
  }, []);

  // keep the URL shareable
  useEffect(() => {
    const u = new URLSearchParams();
    for (const k of ['q', 'seg', 'brand', 'vehicle'] as const) if (f[k] && !(k === 'brand' && f.vehicle)) u.set(k, f[k]);
    const qs = u.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }, [f.q, f.seg, f.brand, f.vehicle]);

  const segName = (id: string) => segments.find((s) => s.id === id)?.name ?? '';
  const vName = (id: string) => { const v = vehicles.find((x) => x.id === id); return v ? `${v.brand} ${v.model}` : id; };
  const brands = useMemo(() => [...new Set(vehicles.map((v) => v.brand))], [vehicles]);
  const brandOf = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v.brand])), [vehicles]);

  const list = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const out = products
      .filter((p) => !f.seg || p.seg === f.seg)
      .filter((p) => !f.vehicle || p.fits.includes(f.vehicle))
      .filter((p) => !f.brand || p.fits.some((id) => brandOf[id] === f.brand))
      .filter((p) => !f.pos || (p.pos ?? '').startsWith(f.pos))
      .filter((p) => !q || [p.name, p.short, segName(p.seg), ...p.fits.map(vName)].join(' ').toLowerCase().includes(q));
    const sorters: Record<string, (a: ProductLite, b: ProductLite) => number> = {
      low: (a, b) => a.price - b.price,
      high: (a, b) => b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
      featured: (a, b) => Number(b.featured) - Number(a.featured) || a.sort - b.sort,
    };
    return out.sort(sorters[f.sort] ?? sorters.featured);
  }, [f, products]);

  const set = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));
  const Chip = ({ k, v, label }: { k: 'seg' | 'brand' | 'pos'; v: string; label: string }) => (
    <button type="button" class="chip" aria-pressed={f[k] === v} onClick={() => set(k === 'brand' ? { brand: v, vehicle: '' } : { [k]: v })}>{label}</button>
  );
  const ctx = [f.vehicle && vName(f.vehicle), !f.vehicle && f.brand, f.seg && segName(f.seg)].filter(Boolean).join(' · ');

  return (
    <div class="container shop">
      <aside class={`filters${showFilters ? ' open' : ''}`} aria-label="Filters">
        <div><h4>Segment</h4><div class="chips"><Chip k="seg" v="" label="All" />{segments.map((s) => <Chip k="seg" v={s.id} label={s.name} />)}</div></div>
        <div><h4>Brand</h4><div class="chips"><Chip k="brand" v="" label="All" />{brands.map((b) => <Chip k="brand" v={b} label={b} />)}</div></div>
        <div>
          <h4><label for="f-vehicle">Model</label></h4>
          <select id="f-vehicle" class="input" value={f.vehicle} onChange={(e) => { const id = e.currentTarget.value; set({ vehicle: id, brand: id ? brandOf[id] : f.brand }); }}>
            <option value="">All models</option>
            {vehicles.filter((v) => !f.brand || v.brand === f.brand).map((v) => <option value={v.id}>{v.brand} {v.model}</option>)}
          </select>
        </div>
        <div><h4>Position</h4><div class="chips"><Chip k="pos" v="" label="All" /><Chip k="pos" v="Front" label="Front" /><Chip k="pos" v="Rear" label="Rear" /></div></div>
        <button type="button" class="btn btn-outline btn-sm" onClick={() => setF({ ...EMPTY, sort: f.sort })}>Clear all</button>
      </aside>

      <div>
        <div class="toolbar">
          <div class="search">
            <span dangerouslySetInnerHTML={{ __html: icons.search }} />
            <label class="sr-only" for="q">Search products</label>
            <input id="q" class="input" type="search" placeholder="Search e.g. Activa, mono shock, shampoo…" value={f.q} onInput={(e) => set({ q: e.currentTarget.value })} />
          </div>
          <select class="input" style="width:auto" aria-label="Sort" value={f.sort} onChange={(e) => set({ sort: e.currentTarget.value })}>
            <option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="name">Name A–Z</option>
          </select>
          <button type="button" class="btn btn-outline btn-sm filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
            <span dangerouslySetInnerHTML={{ __html: icons.filter }} /> Filters
          </button>
        </div>
        <p class="muted" style="font-size:.85rem" aria-live="polite">{list.length} product{list.length === 1 ? '' : 's'}{ctx ? ` for ${ctx}` : ''}</p>
        <div class="grid" style="margin-top:14px">
          {list.length ? list.map((p) => <Card p={p} segName={segName(p.seg)} fits={p.fits.map(vName)} />) : (
            <div class="empty">
              <h3>No matching parts yet</h3>
              <p style="margin:8px 0 16px">Tell us your bike and we'll find the right suspension for you.</p>
              {whatsapp && <a class="btn btn-wa" target="_blank" rel="noopener" href={waLink(whatsapp, `Hi, I am looking for suspension for my ${f.vehicle ? vName(f.vehicle) : f.q || 'bike'}`)}>Ask on WhatsApp</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ p, segName, fits }: { p: ProductLite; segName: string; fits: string[] }) {
  const off = discount(p.price, p.mrp);
  const fitsText = fits.slice(0, 2).join(', ') + (fits.length > 2 ? ` +${fits.length - 2}` : '');
  return (
    <a class="card" href={`/products/${p.slug}`}>
      <div class="media">
        {p.pos && <span class="badge">{p.pos}</span>}
        {p.img ? (
          <img src={imgUrl(p.img, 480)} srcset={srcset(p.img)} sizes="(max-width: 600px) 100vw, 300px" alt={p.img.alt || p.name} width={p.img.w} height={p.img.h} loading="lazy" decoding="async" />
        ) : (
          <>
            <span class="badge sample">Sample image</span>
            <span class="art" dangerouslySetInnerHTML={{ __html: productArt({ slug: p.slug, name: p.name, seg: p.seg, pos: p.pos }) }} />
          </>
        )}
      </div>
      <div class="body">
        <span class="seg-name">{segName}</span>
        <h3>{p.name}</h3>
        <span class="fits">{fits.length ? `Fits: ${fitsText}` : p.short}</span>
        <div class="price"><b>{inr(p.price)}</b>{off > 0 && <><s>{inr(p.mrp)}</s><span class="off">{off}% off</span></>}</div>
      </div>
    </a>
  );
}
