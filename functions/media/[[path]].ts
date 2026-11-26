// Fallback image server for /media/* (local dev, and before the R2 custom domain is set up).
// In production set PUBLIC_MEDIA_URL to the bucket's custom domain so images bypass this Function entirely.
import type { Env } from '../_lib/env';

export const onRequestGet: PagesFunction<Env> = async ({ params, env, request, waitUntil }) => {
  const key = (params.path as string[] | undefined)?.join('/') ?? '';
  if (!/^products\/[0-9a-f-]{36}-(480|960|1600)\.webp$/.test(key)) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const res = new Response(obj.body, {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: obj.httpEtag },
  });
  waitUntil(cache.put(request, res.clone()));
  return res;
};
