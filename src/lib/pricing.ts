// Service pricing by vehicle type (shared by pages, booking form and admin).
import type { Service, ServicePrice, VehicleTypeId } from './types';

export const VEHICLE_ORDER: VehicleTypeId[] = ['bike', 'scooter', 'ev', 'car'];

export const sortPrices = (p: ServicePrice[]) =>
  [...p].sort((a, b) => VEHICLE_ORDER.indexOf(a.vehicle_type) - VEHICLE_ORDER.indexOf(b.vehicle_type));

export const priceFor = (s: Pick<Service, 'prices'>, t: string | null | undefined) =>
  s.prices.find((p) => p.vehicle_type === t) ?? null;

/** Lowest price across vehicle types ("From ₹…"), or null when the service has no prices. */
export const priceFrom = (s: Pick<Service, 'prices'>) => (s.prices.length ? Math.min(...s.prices.map((p) => p.price)) : null);

/** Default vehicle type for a product segment (used by "Book Fitting" links). */
export const vehicleTypeForSegment = (seg: string): VehicleTypeId | null =>
  seg === 'cruiser' || seg === 'commuter' ? 'bike' : seg === 'scooter' ? 'scooter' : null;
