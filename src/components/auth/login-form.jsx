'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [factorLabel, setFactorLabel] = useState('Authenticator app');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rememberSession, setRememberSession] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(mfaRequired ? '/api/v1/auth/mfa-verify' : '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mfaRequired ? { code } : { email, password, remember_session: rememberSession }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        setError(payload?.error?.message || 'Sign-in failed. Please try again.');
        return;
      }
      if (!mfaRequired && payload.data?.mfa_required) {
        setMfaRequired(true);
        setFactorLabel(payload.data.factor_label || 'Authenticator app');
        setPassword('');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('We could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function useAnotherAccount() {
    setBusy(true);
    setError('');
    try {
      await fetch('/api/v1/auth/mfa-cancel', { method: 'POST' });
      setMfaRequired(false);
      setCode('');
      setPassword('');
      setError('');
    } catch {
      setError('Could not cancel this sign-in attempt. Refresh the page and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-5'>
      {mfaRequired ? <>
        <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-4'><span className='grid size-10 place-items-center rounded-xl bg-white text-emerald-800'><ShieldCheck size={21} aria-hidden='true' /></span><h3 className='mt-3 font-semibold text-emerald-950'>Verify it’s you</h3><p className='mt-1 text-sm leading-6 text-emerald-900/80'>Enter the current code from your {factorLabel.toLowerCase()} to finish signing in.</p></div>
        <div><label htmlFor='mfa-code' className='mb-2 block text-sm font-semibold text-slate-700'>Authenticator code</label><input id='mfa-code' name='mfa-code' type='text' inputMode='numeric' pattern='[0-9]*' autoComplete='one-time-code' autoFocus required minLength={6} maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} className='min-h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-xl font-semibold tracking-[0.35em] outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='000000' /></div>
      </> : <>
        <div><label htmlFor='email' className='mb-2 block text-sm font-semibold text-slate-700'>Email address</label><div className='relative'><Mail size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='email' name='email' type='email' autoComplete='username' required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='you@yourchurch.org' /></div></div>
        <div><label htmlFor='password' className='mb-2 block text-sm font-semibold text-slate-700'>Password</label><div className='relative'><LockKeyhole size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='password' name='password' type='password' autoComplete='current-password' required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='Enter your password' /></div></div>
        <div className='flex flex-wrap items-center justify-between gap-3'><label className='inline-flex items-center gap-2 text-sm text-slate-600'><input type='checkbox' checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} className='size-4 rounded border-slate-300 accent-emerald-800' /> Keep me signed in on this device</label><Link href='/forgot-password' className='text-sm font-semibold text-emerald-800 hover:text-emerald-950'>Forgot password?</Link></div>
      </>}
      {error ? <p role='alert' className='rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-5 text-rose-800'>{error}</p> : null}
      <button type='submit' disabled={busy} className='inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60'>{busy ? <><LoaderCircle size={17} className='animate-spin' aria-hidden='true' /> {mfaRequired ? 'Verifying…' : 'Signing in…'}</> : mfaRequired ? 'Verify and continue' : 'Sign in securely'}</button>
      {mfaRequired ? <button type='button' onClick={useAnotherAccount} disabled={busy} className='min-h-10 w-full rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-60'>Use a different account</button> : null}
    </form>
  );
}
