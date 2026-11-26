// Minimal PostgREST client using the service-role key (server-side only). No SDK → tiny bundle, low CPU.
import type { Env } from './env';

export class DbError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function headers(env: Env, extra?: Record<string, string>): Headers {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const h = new Headers({ apikey: key, 'Content-Type': 'application/json', Accept: 'application/json', ...extra });
  // Legacy service_role keys are JWTs and must also be sent as a Bearer token; new sb_secret_ keys go in `apikey` only.
  if (key.startsWith('eyJ')) h.set('Authorization', `Bearer ${key}`);
  return h;
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) return (res.status === 204 ? null : await res.json()) as T;
  let body: { message?: string; code?: string } = {};
  try { body = await res.json(); } catch { /* ignore */ }
  throw new DbError(res.status, body.code ?? String(res.status), body.message ?? res.statusText);
}

export async function rpc<T>(env: Env, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: headers(env), body: JSON.stringify(args) });
  return handle<T>(res);
}

export async function select<T>(env: Env, path: string): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: headers(env) });
  return handle<T>(res);
}

export async function insert<T>(env: Env, table: string, row: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: headers(env, { Prefer: 'return=representation' }), body: JSON.stringify(row),
  });
  return (await handle<T[]>(res))[0];
}

export async function update(env: Env, path: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: headers(env, { Prefer: 'return=minimal' }), body: JSON.stringify(patch),
  });
  await handle(res);
}

/** Calls /auth/v1/user with the user's token — used only when JWKS verification is unavailable. */
export async function getUser(env: Env, token: string): Promise<{ email?: string; app_metadata?: { role?: string } } | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  return res.ok ? res.json() : null;
}
