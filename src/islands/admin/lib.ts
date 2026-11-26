import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { api } from '../../lib/api';
import { IMAGE_WIDTHS } from '../../lib/media';

let client: SupabaseClient | undefined;
export const sb = () =>
  (client ??= createClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'vm-admin-auth' },
  }));

async function token(): Promise<string> {
  const { data } = await sb().auth.getSession();
  if (!data.session) throw { error: 'UNAUTHORIZED', message: 'Your session expired. Please sign in again.' };
  return data.session.access_token;
}

/** Call our own /api/admin/* with the admin's access token. */
export async function adminApi<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  return api<T>(`/api/admin${path}`, { ...init, token: await token() });
}

/** Throws a readable error for Supabase query results. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw { error: 'DB', message: res.error.message };
  return res.data as T;
}

export const errMsg = (e: unknown) => (e as { message?: string })?.message ?? String(e);

export const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Resize an image in the browser to the 3 standard WebP widths, then upload them in one request. */
export async function uploadImage(file: File): Promise<{ id: string; w: number; h: number; kb: number[] }> {
  if (!file.type.startsWith('image/')) throw { message: `${file.name} is not an image` };
  const bmp = await createImageBitmap(file);
  const form = new FormData();
  const kb: number[] = [];
  let big = { w: bmp.width, h: bmp.height };
  for (const W of IMAGE_WIDTHS) {
    const w = Math.min(W, bmp.width);
    const h = Math.round((bmp.height * w) / bmp.width);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.82));
    if (!blob || blob.type !== 'image/webp') throw { message: 'This browser cannot create WebP images. Please use Chrome, Edge or Firefox.' };
    form.append(`w${W}`, new File([blob], `${W}.webp`, { type: 'image/webp' }));
    kb.push(Math.round(blob.size / 1024));
    if (W === 1600) big = { w, h };
  }
  bmp.close();
  const { id } = await adminApi<{ id: string }>('/upload', { method: 'POST', body: form });
  return { id, ...big, kb };
}

export const deleteImage = (id: string) => adminApi(`/media/${id}`, { method: 'DELETE' }).catch(() => undefined);
