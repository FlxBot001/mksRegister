'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MfaSettingsClient from '@/components/auth/mfa-settings-client';
import { CircleAlert, Fingerprint, LoaderCircle, LockKeyhole, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';

export default function SessionSecurityClient() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/v1/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'Could not load session details.');
        if (active) setUser(payload.data.user);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load session details.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function endSession(action) {
    setBusy(action);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/v1/auth/${action}`, { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'Could not update your session.');
      setMessage(payload.message || (action === 'revoke-sessions' ? 'Global sign-out requested.' : 'You have signed out of this browser.'));
      router.replace('/login');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update your session.');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className='min-h-screen flex-1 bg-[#f6f8f7] text-slate-950'>
      <header className='border-b border-slate-200 bg-white'><div className='mx-auto flex min-h-[72px] max-w-5xl items-center justify-between gap-4 px-4 sm:px-7'><Link href='/dashboard' className='flex items-center gap-3'><span className='grid size-10 place-items-center rounded-xl bg-emerald-800 text-white'><Fingerprint size={21} aria-hidden='true' /></span><span><span className='block text-base font-semibold tracking-tight'>MKS Register</span><span className='block text-xs text-slate-500'>Account security</span></span></Link><Link href='/dashboard' className='text-sm font-semibold text-emerald-800 hover:text-emerald-950'>Back to workspace</Link></div></header>
      <div className='mx-auto max-w-5xl px-4 py-8 sm:px-7 sm:py-12'>
        <div className='max-w-2xl'><p className='text-sm font-semibold text-emerald-800'>SECURITY & SESSIONS</p><h1 className='mt-2 text-3xl font-semibold tracking-tight sm:text-4xl'>Protect your account</h1><p className='mt-3 text-sm leading-6 text-slate-500'>Review the account currently signed in on this browser, change your password, or revoke access across your sessions.</p></div>
        {error ? <div role='alert' className='mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800'><CircleAlert size={18} className='mt-0.5 shrink-0' aria-hidden='true' />{error}</div> : null}
        {message ? <p role='status' className='mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm text-emerald-900'>{message}</p> : null}
        <div className='mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]'>
          <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7'><div className='flex items-start gap-4'><span className='grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800'><ShieldCheck size={23} aria-hidden='true' /></span><div><h2 className='text-lg font-semibold'>Current browser session</h2><p className='mt-1 text-sm leading-6 text-slate-500'>This information comes from the live authentication session, not sample data.</p></div></div>
            {loading ? <div className='mt-7 flex items-center gap-3 text-sm text-slate-500'><LoaderCircle size={18} className='animate-spin' aria-hidden='true' /> Verifying account…</div> : <dl className='mt-7 divide-y divide-slate-100 rounded-xl border border-slate-100'><div className='flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'><dt className='text-sm text-slate-500'>Account email</dt><dd className='break-all text-sm font-semibold text-slate-900'>{user?.email || 'Unavailable'}</dd></div><div className='flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'><dt className='text-sm text-slate-500'>Session status</dt><dd className='inline-flex items-center gap-2 text-sm font-semibold text-emerald-800'><span className='size-2 rounded-full bg-emerald-600' /> Active</dd></div><div className='flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between'><dt className='text-sm text-slate-500'>Session storage</dt><dd className='text-sm font-semibold text-slate-900'>HTTP-only, SameSite cookies (Secure in production)</dd></div></dl>}
          </section>
          <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7'><span className='grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-700'><LockKeyhole size={23} aria-hidden='true' /></span><h2 className='mt-4 text-lg font-semibold'>Password</h2><p className='mt-2 text-sm leading-6 text-slate-500'>Use a unique password. Reset links are delivered by your configured Supabase Auth email provider.</p><Link href='/forgot-password' className='mt-5 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50'>Send password reset</Link></section>
        </div>
        <MfaSettingsClient />
        <section className='mt-5 rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-7'><div className='flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between'><div className='flex items-start gap-4'><span className='grid size-12 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-800'><ShieldOff size={23} aria-hidden='true' /></span><div><h2 className='text-lg font-semibold'>Sign out everywhere</h2><p className='mt-1 max-w-xl text-sm leading-6 text-slate-500'>Revoke the current Supabase Auth session globally where supported, then clear this browser’s session cookies. You will need to sign in again.</p></div></div><button type='button' onClick={() => void endSession('revoke-sessions')} disabled={Boolean(busy) || loading || !user} className='inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60'>{busy === 'revoke-sessions' ? <LoaderCircle size={16} className='animate-spin' aria-hidden='true' /> : <LogOut size={16} aria-hidden='true' />} Revoke sessions</button></div></section>
        <p className='mt-5 text-xs leading-5 text-slate-400'>For privacy, MKS Register does not display raw access or refresh tokens. Session inventory across devices depends on capabilities enabled by your authentication provider.</p>
      </div>
    </main>
  );
}
