// Admin check for /api/admin/*: verify the Supabase access token locally against the project's JWKS
// (no network call per request once the keys are cached), then require app_metadata.role === 'admin'.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './env';
import { getUser } from './supabase';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function verifyAdmin(env: Env, authHeader: string | undefined): Promise<{ email: string } | null> {
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;

  try {
    jwks ??= createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`), { cacheMaxAge: 10 * 60_000 });
    const { payload } = await jwtVerify(token, jwks, { issuer: `${env.SUPABASE_URL}/auth/v1`, audience: 'authenticated' });
    const role = (payload.app_metadata as { role?: string } | undefined)?.role;
    return role === 'admin' ? { email: String(payload.email ?? '') } : null;
  } catch (e) {
    // Projects still on the legacy shared-secret (HS256) signing key have no public JWKS: ask Supabase instead.
    const code = (e as { code?: string }).code;
    if (code !== 'ERR_JWKS_NO_MATCHING_KEY' && code !== 'ERR_JOSE_ALG_NOT_ALLOWED' && code !== 'ERR_JWKS_INVALID' && code !== 'ERR_JOSE_NOT_SUPPORTED') {
      return null; // expired / bad signature / wrong issuer
    }
    const user = await getUser(env, token);
    return user?.app_metadata?.role === 'admin' ? { email: user.email ?? '' } : null;
  }
}
