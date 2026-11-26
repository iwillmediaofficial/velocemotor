// Tiny client for our own /api (same origin → no CORS preflight).
export interface ApiError { error: string; message: string; fields?: Record<string, string> }

export async function api<T>(path: string, init: RequestInit & { json?: unknown; token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set('Content-Type', 'application/json');
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  } catch {
    throw { error: 'NETWORK', message: 'Network error. Please check your connection and try again.' } satisfies ApiError;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { error: data.error ?? 'ERROR', message: data.message ?? `Something went wrong (${res.status}).`, fields: data.fields } satisfies ApiError;
  return data as T;
}
