'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LoaderCircle, LockKeyhole, CircleAlert, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordForm() {
  const router = useRouter();
  const [tokens, setTokens] = useState(null);
  const [tokenError, setTokenError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = fragment.get('access_token') || query.get('access_token');
    const refreshToken = fragment.get('refresh_token') || query.get('refresh_token');
    const type = fragment.get('type') || query.get('type');
    if (accessToken && refreshToken && (!type || type === 'recovery')) {
      setTokens({ access_token: accessToken, refresh_token: refreshToken });
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      setTokenError('This page needs a valid password-reset link. Request a new link and open it on this device.');
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!tokens) {
      setError('Open the latest reset link from your email before choosing a password.');
      return;
    }
    if (password.length < 12) {
      setError('Choose a password with at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tokens, password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        setError(payload?.error?.message || 'We could not update your password. Request a new reset link and try again.');
        return;
      }
      setComplete(true);
      window.setTimeout(() => {
        router.replace('/login');
        router.refresh();
      }, 700);
    } catch {
      setError('We could not reach the password service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-5' role='status'><span className='grid size-10 place-items-center rounded-full bg-white text-emerald-800'><CheckCircle2 size={22} aria-hidden='true' /></span><h3 className='mt-4 font-semibold text-emerald-950'>Password updated</h3><p className='mt-2 text-sm leading-6 text-emerald-900/80'>Your password has been changed. Sign in again with your new password to continue.</p></div>;
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-5'>
      {tokenError ? <div className='flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3.5 text-sm leading-5 text-amber-900'><CircleAlert size={18} className='mt-0.5 shrink-0' aria-hidden='true' /><p>{tokenError} <Link href='/forgot-password' className='font-semibold underline underline-offset-2'>Request a new link</Link>.</p></div> : null}
      <div><label htmlFor='new-password' className='mb-2 block text-sm font-semibold text-slate-700'>New password</label><div className='relative'><LockKeyhole size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='new-password' name='new-password' type='password' autoComplete='new-password' required minLength={12} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='At least 12 characters' /></div></div>
      <div><label htmlFor='confirm-password' className='mb-2 block text-sm font-semibold text-slate-700'>Confirm new password</label><input id='confirm-password' name='confirm-password' type='password' autoComplete='new-password' required minLength={12} maxLength={1024} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='Enter it again' /></div>
      {error ? <p role='alert' className='rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-5 text-rose-800'>{error}</p> : null}
      <button type='submit' disabled={busy || !tokens} className='inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60'>{busy ? <><LoaderCircle size={17} className='animate-spin' aria-hidden='true' /> Updating password…</> : 'Update password securely'}</button>
    </form>
  );
}
