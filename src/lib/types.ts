export interface Segment { id: string; name: string; blurb: string; sort: number }
export interface Vehicle { id: string; brand: string; model: string; segment_id: string | null; sort: number }
export interface Spec { label: string; value: string }
export interface ProductImage { id: string; w: number; h: number; alt: string }
export interface Product {
  id: string;
  slug: string;
  name: string;
  segment_id: string;
  position: string | null;
  short_desc: string;
  description: string;
  specs: Spec[];
  price: number;
  mrp: number;
  images: ProductImage[];
  is_featured: boolean;
  show_fitting: boolean;
  sort: number;
  fits: string[]; // vehicle ids
}
export type VehicleTypeId = 'bike' | 'scooter' | 'ev' | 'car';
/** Price and duration of a service for one vehicle type. No entry = not offered for that type. */
export interface ServicePrice { vehicle_type: VehicleTypeId; price: number; duration_min: number }
export interface Service {
  id: string; name: string; description: string; is_bookable: boolean; sort: number; prices: ServicePrice[];
}
export interface Settings {
  phone: string; whatsapp: string; email: string; address: string; hours: string;
}
export interface Catalog {
  segments: Segment[]; vehicles: Vehicle[]; products: Product[]; services: Service[]; settings: Settings;
}
/** Slim product shape shipped to the browser for search/filter. */
export interface ProductLite {
  slug: string; name: string; seg: string; pos: string | null; price: number; mrp: number;
  short: string; fits: string[]; featured: boolean; sort: number; img: ProductImage | null;
}
