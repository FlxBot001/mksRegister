'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, Mail, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/v1/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        setError(payload?.error?.message || 'We could not start account recovery. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('We could not reach the recovery service. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-5' role='status'>
        <span className='grid size-10 place-items-center rounded-full bg-white text-emerald-800'><CheckCircle2 size={22} aria-hidden='true' /></span>
        <h3 className='mt-4 font-semibold text-emerald-950'>Check your inbox</h3>
        <p className='mt-2 text-sm leading-6 text-emerald-900/80'>If an account matches <span className='font-semibold'>{email}</span>, password-reset instructions will be sent. Check your spam folder too.</p>
        <button type='button' onClick={() => setSent(false)} className='mt-4 text-sm font-semibold text-emerald-900 underline underline-offset-4'>Try another email</button>
        <Link href='/login' className='mt-4 block text-sm font-semibold text-slate-700 hover:text-emerald-800'>Return to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-5'>
      <div><label htmlFor='recovery-email' className='mb-2 block text-sm font-semibold text-slate-700'>Email address</label><div className='relative'><Mail size={18} className='pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input id='recovery-email' name='email' type='email' autoComplete='email' required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className='min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='you@yourchurch.org' /></div></div>
      {error ? <p role='alert' className='rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm leading-5 text-rose-800'>{error}</p> : null}
      <button type='submit' disabled={busy} className='inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60'>{busy ? <><LoaderCircle size={17} className='animate-spin' aria-hidden='true' /> Sending…</> : 'Send reset instructions'}</button>
    </form>
  );
}
