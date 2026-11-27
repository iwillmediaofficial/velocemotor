// BUILD-TIME ONLY. Reads the catalogue from Supabase once per build (6 small queries),
// so visitors never hit the database while browsing.
import type { Catalog, Product, ProductLite, Promo, Segment, Service, ServicePrice, Settings, Vehicle } from './types';
import { sortPrices } from './pricing';

const URL = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_KEY;

async function get<T>(path: string): Promise<T> {
  if (!URL || !KEY) throw new Error('PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_KEY are not set (see .env.example)');
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Supabase ${res.status} on ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

let cached: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
  cached ??= (async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const [segments, vehicles, rawProducts, services, settings, promos] = await Promise.all([
      get<Segment[]>('segments?select=id,name,blurb,sort&order=sort'),
      get<Vehicle[]>('vehicles?select=id,brand,model,segment_id,sort&order=sort,brand,model'),
      get<(Omit<Product, 'fits'> & { product_fitment: { vehicle_id: string }[] })[]>(
        'products?select=id,slug,name,segment_id,position,short_desc,description,specs,price,mrp,images,is_featured,show_fitting,sort,product_fitment(vehicle_id)&is_active=eq.true&order=sort,name',
      ),
      get<(Omit<Service, 'prices'> & { service_prices: ServicePrice[] })[]>(
        'services?select=id,name,description,is_bookable,sort,service_prices(vehicle_type,price,duration_min)&is_active=eq.true&order=sort',
      ),
      get<Settings[]>('settings?select=phone,whatsapp,email,address,hours&id=eq.1'),
      // expired offers are skipped; future ones are included and hidden in the browser until their start day
      get<Promo[]>(`promos?select=id,kind,title,subtitle,highlight,cta_label,cta_url,image,image_mobile,image_has_text,starts_on,ends_on,sort&is_active=eq.true&or=(ends_on.is.null,ends_on.gte.${today})&order=sort,created_at`),
    ]);
    const products: Product[] = rawProducts.map(({ product_fitment, ...p }) => ({
      ...p,
      price: Number(p.price),
      mrp: Number(p.mrp),
      fits: product_fitment.map((f) => f.vehicle_id),
    }));
    return {
      segments,
      vehicles,
      products,
      services: services.map(({ service_prices, ...s }) => ({
        ...s,
        prices: sortPrices(service_prices.map((p) => ({ ...p, price: Number(p.price) }))),
      })),
      settings: settings[0] ?? { phone: '', whatsapp: '', email: '', address: '', hours: '' },
      promos,
    };
  })();
  return cached;
}

export const toLite = (p: Product): ProductLite => ({
  slug: p.slug, name: p.name, seg: p.segment_id, pos: p.position, price: p.price, mrp: p.mrp,
  short: p.short_desc, fits: p.fits, featured: p.is_featured, sort: p.sort, img: p.images[0] ?? null,
});
