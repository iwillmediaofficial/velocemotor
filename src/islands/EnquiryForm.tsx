import { useEffect, useState } from 'preact/hooks';
import { enquirySchema, fieldErrors } from '../lib/schemas';
import { api, type ApiError } from '../lib/api';
import Turnstile from './Turnstile';

interface Props { products: { id: string; slug: string; name: string }[] }

export default function EnquiryForm({ products }: Props) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', product: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const slug = new URLSearchParams(location.search).get('product');
    const p = products.find((x) => x.slug === slug);
    if (p) setForm((f) => ({ ...f, product: p.id, message: f.message || `I'm interested in ${p.name}. ` }));
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    const parsed = enquirySchema.safeParse({ ...form, product: form.product || null, token });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    if (!token) { setStatus({ ok: false, msg: 'Please wait a moment while we verify you are human, then try again.' }); return; }
    setErrors({}); setBusy(true); setStatus(null);
    try {
      await api('/api/enquiry', { method: 'POST', json: parsed.data });
      setForm({ name: '', phone: '', email: '', product: '', message: '' });
      setStatus({ ok: true, msg: "Thanks! We've received your message and will get back to you shortly." });
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.fields) setErrors(e2.fields);
      setStatus({ ok: false, msg: e2.message });
    } finally { setBusy(false); setResetKey((k) => k + 1); }
  };

  const bind = (k: keyof typeof form) => ({
    id: `e-${k}`, name: k, class: 'input', value: form[k], 'aria-invalid': errors[k] ? true : undefined,
    onInput: (e: Event) => setForm({ ...form, [k]: (e.currentTarget as HTMLInputElement).value }),
  });
  const Err = ({ k }: { k: string }) => <span class="err-msg">{errors[k] ?? ''}</span>;

  return (
    <form class="form-grid" noValidate onSubmit={submit}>
      {status && <div class={`alert full ${status.ok ? 'ok' : 'bad'}`} role="status">{status.msg}</div>}
      <div class="field"><label for="e-name">Name *</label><input {...bind('name')} autoComplete="name" /><Err k="name" /></div>
      <div class="field"><label for="e-phone">Mobile *</label><input {...bind('phone')} inputMode="tel" autoComplete="tel" /><Err k="phone" /></div>
      <div class="field"><label for="e-email">Email</label><input {...bind('email')} type="email" autoComplete="email" /><Err k="email" /></div>
      <div class="field"><label for="e-product">Product (optional)</label>
        <select {...bind('product')} onChange={(e) => setForm({ ...form, product: e.currentTarget.value })}>
          <option value="">General enquiry</option>
          {products.map((p) => <option value={p.id}>{p.name}</option>)}
        </select><Err k="product" /></div>
      <div class="field full"><label for="e-message">Message *</label><textarea {...bind('message')} placeholder="Your bike model, what you need, any questions…" /><Err k="message" /></div>
      <Turnstile onToken={setToken} resetKey={resetKey} />
      <div class="full"><button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send Enquiry'}</button></div>
    </form>
  );
}
