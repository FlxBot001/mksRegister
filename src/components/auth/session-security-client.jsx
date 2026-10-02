'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MfaSettingsClient from '@/components/auth/mfa-settings-client';
import { CircleAlert, Fingerprint, LoaderCircle, LockKeyhole, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';

export default function SessionSecurityClient() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all(['/api/v1/auth/session', '/api/v1/auth/sessions'].map(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'Could not load session details.');
      return payload.data;
    })).then(([sessionData, sessionList]) => {
      if (active) { setUser(sessionData.user); setSessions(Array.isArray(sessionList) ? sessionList : []); }
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

  async function revokeIndividual(session) {
    const confirmed = window.confirm(session.current ? 'Sign out this browser session?' : 'Revoke this active session?');
    if (!confirmed) return;
    setBusy('session:' + session.id); setError(''); setMessage('');
    try {
      const response = await fetch('/api/v1/auth/revoke-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: session.id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'Could not revoke this session.');
      if (payload.data?.current) { router.replace('/login'); router.refresh(); return; }
      setSessions((items) => items.filter((item) => item.id !== session.id));
      setMessage('Selected session revoked.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not revoke this session.'); }
    finally { setBusy(''); }
  }

  async function changePassword(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return; }
    if (newPassword.length < 12) { setError('Use at least 12 characters for your new password.'); return; }
    setBusy('password');
    try {
      const response = await fetch('/api/v1/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'Could not change your password.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setMessage(payload.message || 'Password changed successfully.');
      const sessionsResponse = await fetch('/api/v1/auth/sessions', { cache: 'no-store' });
      const sessionsPayload = await sessionsResponse.json().catch(() => null);
      if (sessionsResponse.ok && sessionsPayload?.success) setSessions(sessionsPayload.data || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not change your password.'); }
    finally { setBusy(''); }
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
          <section className='rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7'><span className='grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-700'><LockKeyhole size={23} aria-hidden='true' /></span><h2 className='mt-4 text-lg font-semibold'>Password</h2><p className='mt-2 text-sm leading-6 text-slate-500'>Use a unique password. Password changes revoke other active sessions. Recovery email requires your configured email delivery service.</p><Link href='/forgot-password' className='mt-5 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50'>Send password reset</Link></section>
        </div>
        <section className='mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7'>
          <div className='flex items-start gap-3'><span className='grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800'><LockKeyhole size={20} aria-hidden='true' /></span><div><h2 className='text-lg font-semibold'>Change password</h2><p className='mt-1 text-sm leading-6 text-slate-500'>Confirm your current password and choose a new one with at least 12 characters.</p></div></div>
          <form onSubmit={changePassword} className='mt-5 grid gap-4 sm:grid-cols-3'>
            <div><label htmlFor='current-password' className='mb-2 block text-sm font-semibold text-slate-700'>Current password</label><input id='current-password' type='password' autoComplete='current-password' required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className='min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' /></div>
            <div><label htmlFor='new-password' className='mb-2 block text-sm font-semibold text-slate-700'>New password</label><input id='new-password' type='password' autoComplete='new-password' required minLength={12} value={newPassword} onChange={e => setNewPassword(e.target.value)} className='min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' /></div>
            <div><label htmlFor='confirm-new-password' className='mb-2 block text-sm font-semibold text-slate-700'>Confirm new password</label><input id='confirm-new-password' type='password' autoComplete='new-password' required minLength={12} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className='min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' /></div>
            <div className='sm:col-span-3'><button type='submit' disabled={Boolean(busy)} className='inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60'>{busy === 'password' ? <LoaderCircle size={16} className='animate-spin' aria-hidden='true' /> : null}Change password</button></div>
          </form>
        </section>
        <section className='mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7'>
          <div><h2 className='text-lg font-semibold'>Active sessions</h2><p className='mt-1 text-sm leading-6 text-slate-500'>Revoke an individual session you no longer recognize. Browser names are based on the recorded user-agent string.</p></div>
          {loading ? <div className='mt-5 flex items-center gap-3 text-sm text-slate-500'><LoaderCircle size={18} className='animate-spin' aria-hidden='true' /> Loading sessions…</div> : <div className='mt-5 space-y-3'>{sessions.map(session => <div key={session.id} className='flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between'><div className='min-w-0'><div className='flex flex-wrap items-center gap-2'><p className='text-sm font-semibold text-slate-900'>{session.current ? 'This browser' : 'Other session'}</p>{session.current ? <span className='rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'>Current</span> : null}{session.mfa_verified ? <span className='rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'>MFA verified</span> : null}</div><p className='mt-1 truncate text-xs text-slate-500'>{session.user_agent}</p><p className='mt-1 text-xs text-slate-500'>Last active {session.last_seen_at ? new Date(session.last_seen_at).toLocaleString() : 'Unknown'} · Expires {session.expires_at ? new Date(session.expires_at).toLocaleString() : 'Unknown'}</p></div><button type='button' onClick={() => void revokeIndividual(session)} disabled={Boolean(busy)} className='inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 px-3.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-60'>{busy === 'session:' + session.id ? <LoaderCircle size={15} className='animate-spin' aria-hidden='true' /> : <ShieldOff size={15} aria-hidden='true' />}{session.current ? 'Sign out' : 'Revoke'}</button></div>)}</div>}
        </section>
        <MfaSettingsClient />
        <section className='mt-5 rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-7'><div className='flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between'><div className='flex items-start gap-4'><span className='grid size-12 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-800'><ShieldOff size={23} aria-hidden='true' /></span><div><h2 className='text-lg font-semibold'>Sign out everywhere</h2><p className='mt-1 max-w-xl text-sm leading-6 text-slate-500'>Revoke every active MongoDB session for this account, then clear this browser’s session cookies. You will need to sign in again.</p></div></div><button type='button' onClick={() => void endSession('revoke-sessions')} disabled={Boolean(busy) || loading || !user} className='inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60'>{busy === 'revoke-sessions' ? <LoaderCircle size={16} className='animate-spin' aria-hidden='true' /> : <LogOut size={16} aria-hidden='true' />} Revoke sessions</button></div></section>
        <p className='mt-5 text-xs leading-5 text-slate-400'>For privacy, MKS Register does not display raw access or refresh tokens. Session inventory is stored in MongoDB; raw session tokens are never displayed.</p>
      </div>
    </main>
  );
}
