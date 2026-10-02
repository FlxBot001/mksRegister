'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';

async function requestJson(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'The security request failed.');
  return payload.data;
}

export default function MfaSettingsClient() {
  const [factors, setFactors] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadFactors = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await requestJson('/api/v1/auth/mfa-factors');
      setFactors(Array.isArray(data) ? data : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load authenticator settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFactors(); }, [loadFactors]);

  async function beginEnrollment() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await requestJson('/api/v1/auth/mfa-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendly_name: 'MKS Register authenticator' }),
      });
      setEnrollment(data.factor);
      setCode('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start authenticator setup.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnrollment(event) {
    event.preventDefault();
    if (!enrollment?.id) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await requestJson('/api/v1/auth/mfa-enroll-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factor_id: enrollment.id, code }),
      });
      setEnrollment(null);
      setCode('');
      setMessage('Authenticator verification is complete. Multi-factor sign-in is now enabled for this account.');
      await loadFactors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not verify this authenticator.');
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factor) {
    const confirmed = window.confirm(`Remove ${factor.friendly_name || 'this authenticator'} from your account? You may be asked to set up MFA again if your organization requires it.`);
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await requestJson('/api/v1/auth/mfa-unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factor_id: factor.id }),
      });
      setMessage('Authenticator removed.');
      if (enrollment?.id === factor.id) setEnrollment(null);
      await loadFactors();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this authenticator.');
    } finally {
      setBusy(false);
    }
  }

  const qrImage = enrollment?.qr_code
    ? (enrollment.qr_code.startsWith('data:') ? enrollment.qr_code : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr_code)}`)
    : '';

  return (
    <section className='mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7'>
      <div className='flex items-start gap-4'><span className='grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800'><ShieldCheck size={23} aria-hidden='true' /></span><div><h2 className='text-lg font-semibold'>Multi-factor authentication</h2><p className='mt-1 max-w-2xl text-sm leading-6 text-slate-500'>Add an authenticator app to require a time-based code after your password. Keep your authenticator available when signing in on a new device.</p></div></div>
      {error ? <div role='alert' className='mt-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800'><CircleAlert size={17} className='mt-0.5 shrink-0' aria-hidden='true' />{error}</div> : null}
      {message ? <p role='status' className='mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'>{message}</p> : null}
      {loading ? <div className='mt-6 flex items-center gap-3 text-sm text-slate-500'><LoaderCircle size={18} className='animate-spin' aria-hidden='true' /> Loading authenticators…</div> : <>
        {factors.length ? <div className='mt-6 space-y-3'>{factors.map((factor) => <div key={factor.id} className='flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between'><div className='flex items-start gap-3'><span className='grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-600'><LockKeyhole size={19} aria-hidden='true' /></span><div><p className='font-semibold text-slate-900'>{factor.friendly_name || 'Authenticator app'}</p><p className='mt-1 text-xs text-slate-500'>{factor.factor_type === 'totp' ? 'Time-based authenticator' : factor.factor_type || 'Authentication factor'} · <span className={factor.status === 'verified' ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-800'}>{factor.status === 'verified' ? 'Verified' : 'Setup incomplete'}</span></p></div></div><button type='button' onClick={() => void removeFactor(factor)} disabled={busy} className='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60'><ShieldOff size={15} aria-hidden='true' /> Remove</button></div>)}</div> : <div className='mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5'><p className='font-semibold text-slate-900'>No authenticator is enrolled</p><p className='mt-1 text-sm leading-6 text-slate-500'>Set up a TOTP authenticator such as an authenticator app on your phone. The secret is shown only during setup.</p></div>}
        {enrollment ? <div className='mt-6 grid gap-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 md:grid-cols-[180px_minmax(0,1fr)]'><div className='rounded-xl border border-slate-200 bg-white p-3'>{qrImage ? <img src={qrImage} alt='Authenticator setup QR code' className='mx-auto aspect-square w-full max-w-[180px]' /> : <div className='grid aspect-square place-items-center text-xs text-slate-500'>QR code unavailable</div>}</div><div><h3 className='font-semibold text-slate-950'>1. Scan this QR code</h3><p className='mt-1 text-sm leading-6 text-slate-600'>Use your authenticator app. If scanning is unavailable, enter the setup key below manually.</p><p className='mt-3 break-all rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800'>{enrollment.secret || 'Setup key unavailable'}</p><form onSubmit={verifyEnrollment} className='mt-4 space-y-3'><label htmlFor='mfa-enroll-code' className='block text-sm font-semibold text-slate-700'>2. Enter the current code</label><input id='mfa-enroll-code' inputMode='numeric' autoComplete='one-time-code' pattern='[0-9]*' required minLength={6} maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} className='min-h-12 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 text-center text-lg font-semibold tracking-[0.3em] outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='000000' /><div className='flex flex-wrap gap-2'><button type='submit' disabled={busy} className='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60'>{busy ? <LoaderCircle size={15} className='animate-spin' aria-hidden='true' /> : <ShieldCheck size={15} aria-hidden='true' />} Verify and enable</button><button type='button' onClick={() => { setEnrollment(null); setCode(''); }} disabled={busy} className='min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-white'>Cancel setup</button></div></form></div></div> : null}
        {!enrollment ? <button type='button' onClick={() => void beginEnrollment()} disabled={busy} className='mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60'>{busy ? <LoaderCircle size={16} className='animate-spin' aria-hidden='true' /> : <RefreshCw size={16} aria-hidden='true' />} Add authenticator</button> : null}
      </>}
      <p className='mt-5 text-xs leading-5 text-slate-400'>If you remove your only verified authenticator, MFA will no longer be required for future sign-ins unless your organization enforces it through the identity provider.</p>
    </section>
  );
}
