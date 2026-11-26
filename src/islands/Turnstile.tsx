// Cloudflare Turnstile (free, privacy-friendly bot check). Loads its script only when a form is shown.
import { useEffect, useRef } from 'preact/hooks';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
    __tsLoading?: Promise<void>;
  }
}

const SITE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;

function load(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__tsLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(s);
  });
  return window.__tsLoading;
}

/** Renders the widget and reports the token. `resetKey` changes force a fresh token (tokens are single-use). */
export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (t: string) => void; resetKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!SITE_KEY) { onToken('dev'); return; }
    let cancelled = false;
    load().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        size: 'flexible',
        appearance: 'interaction-only',
        callback: (t: string) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    }).catch(() => onToken(''));
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
    };
  }, []);

  useEffect(() => {
    if (resetKey && idRef.current && window.turnstile) { onToken(''); window.turnstile.reset(idRef.current); }
  }, [resetKey]);

  return <div ref={ref} class="full" />;
}
