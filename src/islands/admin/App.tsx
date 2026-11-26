import { useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { adminApi, ago, errMsg, sb } from './lib';
import { Loading, ToastProvider, useToast } from './ui';
import Dashboard from './Dashboard';
import Bookings from './Bookings';
import Enquiries from './Enquiries';
import Products from './Products';
import Services from './Services';
import Vehicles from './Vehicles';
import SettingsPage from './Settings';

const TABS = [
  ['dashboard', 'Dashboard'], ['bookings', 'Bookings'], ['enquiries', 'Enquiries'], ['products', 'Products'],
  ['services', 'Services'], ['vehicles', 'Vehicles'], ['settings', 'Settings'],
] as const;
type Tab = (typeof TABS)[number][0];

const isAdmin = (s: Session | null) => s?.user?.app_metadata?.role === 'admin';

export default function AdminApp() {
  return <ToastProvider><Root /></ToastProvider>;
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    sb().auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Loading />;
  if (!session) return <Login />;
  if (!isAdmin(session)) return <NotAdmin email={session.user.email ?? ''} />;
  return <Shell session={session} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const signIn = async (e: Event) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message });
  };
  const reset = async () => {
    if (!email.trim()) return setMsg({ ok: false, text: 'Enter your email first, then click "Forgot password".' });
    const { error } = await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/admin` });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'If that account exists, a reset link is on its way.' });
  };

  return (
    <div class="login">
      <form class="panel" onSubmit={signIn}>
        <img src="/assets/veloce-logo.webp" alt="Veloce" width="90" height="70" />
        <h1 style="text-align:center;font-size:1.3rem">Admin Sign In</h1>
        <p class="muted" style="text-align:center;font-size:.88rem;margin:6px 0 20px">Authorised staff only</p>
        {msg && <div class={`alert ${msg.ok ? 'ok' : 'bad'}`} role="alert" style="margin-bottom:14px">{msg.text}</div>}
        <div class="field"><label for="a-email">Email</label><input id="a-email" class="input" type="email" autoComplete="username" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} /></div>
        <div class="field" style="margin-top:12px"><label for="a-pass">Password</label><input id="a-pass" class="input" type="password" autoComplete="current-password" required value={password} onInput={(e) => setPassword(e.currentTarget.value)} /></div>
        <button class="btn btn-primary" style="width:100%;margin-top:18px" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
        <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:.85rem">
          <a class="muted" href="/">← Website</a>
          <button type="button" class="linkish" onClick={reset}>Forgot password?</button>
        </div>
      </form>
    </div>
  );
}

function NotAdmin({ email }: { email: string }) {
  return (
    <div class="login"><div class="panel" style="text-align:center">
      <h1 style="font-size:1.3rem">No admin access</h1>
      <p class="muted" style="margin:10px 0 18px"><b>{email}</b> is signed in but is not an admin. Ask the site owner to grant access, then sign in again.</p>
      <button class="btn btn-outline" onClick={() => sb().auth.signOut()}>Sign out</button>
    </div></div>
  );
}

function readTab(): Tab {
  const t = location.hash.replace(/^#\/?/, '').split('?')[0] as Tab;
  return TABS.some(([k]) => k === t) ? t : 'dashboard';
}

function Shell({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>(readTab());
  const [pub, setPub] = useState<{ content_updated_at: string; last_publish_at: string | null } | null>(null);
  const [counts, setCounts] = useState({ bookings: 0, enquiries: 0 });
  const [publishing, setPublishing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const on = () => setTab(readTab());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const refreshMeta = async () => {
    const [s, b, e] = await Promise.all([
      sb().from('settings').select('content_updated_at,last_publish_at').eq('id', 1).single(),
      sb().from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      sb().from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ]);
    if (s.data) setPub(s.data);
    setCounts({ bookings: b.count ?? 0, enquiries: e.count ?? 0 });
  };
  useEffect(() => { refreshMeta(); }, [tab]);

  const dirty = pub && (!pub.last_publish_at || Date.parse(pub.content_updated_at) > Date.parse(pub.last_publish_at));
  const publish = async () => {
    setPublishing(true);
    try {
      const r = await adminApi<{ last_publish_at: string }>('/publish', { method: 'POST' });
      setPub((p) => (p ? { ...p, last_publish_at: r.last_publish_at } : p));
      toast('Publishing started. The website will update in about 1–2 minutes.', 'info');
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setPublishing(false); }
  };

  const Page = { dashboard: Dashboard, bookings: Bookings, enquiries: Enquiries, products: Products, services: Services, vehicles: Vehicles, settings: SettingsPage }[tab];
  const title = TABS.find(([k]) => k === tab)![1];

  return (
    <div class="admin">
      <aside class="side">
        <img src="/assets/veloce-logo.webp" alt="Veloce" width="57" height="44" />
        <nav aria-label="Admin">
          {TABS.map(([k, label]) => {
            const c = k === 'bookings' ? counts.bookings : k === 'enquiries' ? counts.enquiries : 0;
            return <a href={`#/${k}`} aria-current={tab === k ? 'page' : undefined}><span>{label}</span>{c > 0 && <span class="count">{c}</span>}</a>;
          })}
        </nav>
        <div class="bottom">
          <span class="muted" style="font-size:.75rem;padding:0 .8rem;overflow:hidden;text-overflow:ellipsis">{session.user.email}</span>
          <a href="/" target="_blank" rel="noopener">View website ↗</a>
          <button type="button" class="linkish" style="text-align:left;padding:.65rem .8rem;color:inherit" onClick={() => sb().auth.signOut()}>Sign out</button>
        </div>
      </aside>
      <div class="admin-main">
        <div class="admin-top">
          <h1>{title}</h1>
          <div class="publish">
            <span><span class={`dot ${dirty ? 'pending' : ''}`} />{dirty ? 'Unpublished changes' : 'Website up to date'}{pub?.last_publish_at ? ` · last published ${ago(pub.last_publish_at)}` : ''}</span>
            <button class="btn btn-primary btn-sm" disabled={!dirty || publishing} onClick={publish} title="Rebuild the public website with your latest changes">{publishing ? 'Publishing…' : 'Publish changes'}</button>
          </div>
        </div>
        <Page onChange={refreshMeta} />
      </div>
    </div>
  );
}
