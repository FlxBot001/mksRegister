'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LoaderCircle, LockKeyhole, Mail } from 'lucide-react';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rememberSession, setRememberSession] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, remember_session: rememberSession }) });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setError(payload?.error?.message || 'Sign-in failed. Please try again.');
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

  return (
    <form onSubmit={handleSubmit} className='space-y-5'>
      <div><label htmlFor='email' className='mb-2 block text-sm font-semibold text-slate-700'>Email address</label><div className='relative'><Mail size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='email' name='email' type='email' autoComplete='username' required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='you@yourchurch.org' /></div></div>
      <div><label htmlFor='password' className='mb-2 block text-sm font-semibold text-slate-700'>Password</label><div className='relative'><LockKeyhole size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='password' name='password' type='password' autoComplete='current-password' required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='Enter your password' /></div></div>
      <div className='flex flex-wrap items-center justify-between gap-3'><label className='inline-flex items-center gap-2 text-sm text-slate-600'><input type='checkbox' checked={rememberSession} onChange={(event) => setRememberSession(event.target.checked)} className='size-4 rounded border-slate-300 accent-emerald-800' /> Keep me signed in on this device</label><Link href='/forgot-password' className='text-sm font-semibold text-emerald-800 hover:text-emerald-950'>Forgot password?</Link></div>
      {error ? <p role='alert' className='rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-5 text-rose-800'>{error}</p> : null}
      <button type='submit' disabled={busy} className='inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60'>{busy ? <><LoaderCircle size={17} className='animate-spin' aria-hidden='true' /> Signing in…</> : 'Sign in securely'}</button>
    </form>
  );
}
