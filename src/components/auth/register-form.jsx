'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LoaderCircle, Mail, LockKeyhole, UserRound } from 'lucide-react';

export default function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: fullName, email, password }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) { setError(payload?.error?.message || 'Account creation failed. Please try again.'); return; }
      router.replace('/dashboard');
      router.refresh();
    } catch { setError('We could not reach the registration service. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className='space-y-5'>
    <div><label htmlFor='full-name' className='mb-2 block text-sm font-semibold text-slate-700'>Full name</label><div className='relative'><UserRound size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='full-name' autoComplete='name' required minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='Your name' /></div></div>
    <div><label htmlFor='register-email' className='mb-2 block text-sm font-semibold text-slate-700'>Email address</label><div className='relative'><Mail size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='register-email' type='email' autoComplete='email' required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='you@yourchurch.org' /></div></div>
    <div><label htmlFor='register-password' className='mb-2 block text-sm font-semibold text-slate-700'>Password</label><div className='relative'><LockKeyhole size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='register-password' type='password' autoComplete='new-password' required minLength={12} maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='At least 12 characters' /></div></div>
    <div><label htmlFor='confirm-password' className='mb-2 block text-sm font-semibold text-slate-700'>Confirm password</label><input id='confirm-password' type='password' autoComplete='new-password' required minLength={12} maxLength={1024} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='Re-enter your password' /></div>
    {error ? <p role='alert' className='rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800'>{error}</p> : null}
    <button type='submit' disabled={busy} className='inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60'>{busy ? <><LoaderCircle size={17} className='animate-spin' aria-hidden='true' /> Creating account…</> : 'Create account'}</button>
    <p className='text-center text-sm text-slate-500'>Already registered? <Link href='/login' className='font-semibold text-emerald-800 hover:underline'>Sign in</Link></p>
  </form>;
}
