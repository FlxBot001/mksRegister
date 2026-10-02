'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AcceptInvitationClient({ token }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function accept() {
    setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch('/api/v1/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error?.message || 'Could not accept this invitation.');
      setSuccess('Invitation accepted. Your workspace is now available.');
      setTimeout(() => router.replace('/dashboard'), 900);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not accept this invitation.'); }
    finally { setBusy(false); }
  }
  return <main className='grid min-h-screen place-items-center bg-[#f6f8f7] px-4 py-12 text-slate-950'><section className='w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm'><p className='text-sm font-semibold text-emerald-800'>MKS REGISTER</p><h1 className='mt-3 text-2xl font-semibold'>Accept workspace invitation</h1><p className='mt-2 text-sm leading-6 text-slate-500'>Sign in with the email address that was invited, then accept to activate your workspace membership.</p>{error && <p role='alert' className='mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800'>{error}</p>}{success && <p role='status' className='mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900'>{success}</p>}<button type='button' onClick={accept} disabled={busy || token.length < 32} className='mt-5 min-h-11 w-full rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'>{busy ? 'Accepting…' : 'Accept invitation'}</button>{!token && <p className='mt-3 text-sm text-rose-700'>Invitation token is missing. Open the complete link from your inviter.</p>}<p className='mt-5 text-center text-sm text-slate-500'><Link href='/login' className='font-semibold text-emerald-800 underline'>Sign in</Link> or <Link href='/register' className='font-semibold text-emerald-800 underline'>create an account</Link> with the invited email to continue.</p></section></main>;
}
