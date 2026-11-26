// Validation shared by the browser forms and the Cloudflare Functions (single source of truth).
import { z } from 'zod';

const normPhone = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
};

export const phone = z
  .string()
  .trim()
  .transform(normPhone)
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number');

const optEmail = z
  .string()
  .trim()
  .max(254)
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email')
  .optional()
  .default('');

export const VEHICLE_TYPES = {
  bike: 'Bike / Motorcycle',
  scooter: 'Scooter',
  ev: 'Electric Scooter',
  car: 'Car',
} as const;
export type VehicleType = keyof typeof VEHICLE_TYPES;
export const vehicleTypeLabel = (t: string | null | undefined) => (t && t in VEHICLE_TYPES ? VEHICLE_TYPES[t as VehicleType] : '');

export const bookingSchema = z.object({
  service: z.string().regex(/^[a-z0-9-]+$/, 'Choose a service'),
  product: z.uuid().optional().nullable(),
  name: z.string().trim().min(2, 'Please enter your name').max(100),
  phone,
  email: z.string().trim().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email'),
  vehicle_type: z.enum(['bike', 'scooter', 'ev', 'car'], { error: 'Choose your vehicle type' }),
  vehicle: z.string().trim().min(2, 'Tell us your vehicle').max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  slot: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  notes: z.string().trim().max(1000).optional().default(''),
  token: z.string().max(4096).optional().default(''),
});
export type BookingInput = z.input<typeof bookingSchema>;

export const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(100),
  phone,
  email: optEmail,
  product: z.uuid().optional().nullable().or(z.literal('')),
  message: z.string().trim().min(10, 'Please write at least 10 characters').max(2000),
  token: z.string().max(4096).optional().default(''),
});
export type EnquiryInput = z.input<typeof enquirySchema>;

export const BOOKING_STATUSES = ['pending', 'confirmed', 'rescheduled', 'completed', 'cancelled'] as const;

/** Where a booking came from. Online = the website form; the rest are entered by the admin. */
export const BOOKING_SOURCES = { online: 'Website', phone: 'Phone call', walk_in: 'Walk-in', whatsapp: 'WhatsApp' } as const;

export const adminCreateBookingSchema = z.object({
  source: z.enum(['phone', 'walk_in', 'whatsapp'], { error: 'Choose how the customer booked' }),
  status: z.enum(['confirmed', 'pending']).default('confirmed'),
  service: z.string().regex(/^[a-z0-9-]+$/, 'Choose a service'),
  vehicle_type: z.enum(['bike', 'scooter', 'ev', 'car'], { error: 'Choose the vehicle type' }),
  vehicle: z.string().trim().min(2, 'Enter the vehicle').max(120),
  name: z.string().trim().min(2, 'Enter the customer name').max(100),
  phone,
  email: optEmail,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  slot: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  price: z.number().min(0, 'Price cannot be negative').max(10_000_000).nullable().optional(),
  notes: z.string().trim().max(1000).optional().default(''),
  admin_note: z.string().trim().max(2000).optional().default(''),
  notify: z.boolean().optional().default(true),
});
export type AdminCreateBookingInput = z.input<typeof adminCreateBookingSchema>;

export const adminBookingUpdateSchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  admin_note: z.string().max(2000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slot: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notify: z.boolean().optional().default(true),
});

/** Map zod issues to { field: message } for form display. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? 'form');
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
