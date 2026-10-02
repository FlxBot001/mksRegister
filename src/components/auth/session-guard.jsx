'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleAlert, Fingerprint, LoaderCircle, RefreshCw } from 'lucide-react';

export default function SessionGuard({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ status: 'checking', message: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function verify() {
      try {
        const response = await fetch('/api/v1/auth/session', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!active) return;
        if (response.status === 401) {
          router.replace('/login');
          return;
        }
        if (!response.ok || !payload?.success) {
          setState({ status: 'error', message: payload?.error?.message || 'We could not verify your session. Try again.' });
          return;
        }
        setState({ status: 'ready', message: '' });
      } catch {
        if (active) setState({ status: 'error', message: 'We could not reach the session service. Check your connection and retry.' });
      }
    }
    setState({ status: 'checking', message: '' });
    void verify();
    return () => { active = false; };
  }, [attempt, router]);

  if (state.status === 'ready') return children;

  return (
    <main className='flex min-h-screen flex-1 items-center justify-center bg-[#f6f8f7] px-5 py-12 text-slate-950'>
      <section className='w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5'>
        <span className='mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800'><Fingerprint size={27} aria-hidden='true' /></span>
        <p className='mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800'>MKS Register</p>
        {state.status === 'checking' ? <><LoaderCircle size={22} className='mx-auto mt-5 animate-spin text-emerald-800' aria-hidden='true' /><h1 className='mt-4 text-xl font-semibold'>Verifying your session</h1><p className='mt-2 text-sm leading-6 text-slate-500'>Checking your secure workspace access before loading private records.</p></> : <><span className='mx-auto mt-5 grid size-10 place-items-center rounded-full bg-amber-50 text-amber-800'><CircleAlert size={21} aria-hidden='true' /></span><h1 className='mt-4 text-xl font-semibold'>Session check unavailable</h1><p role='alert' className='mt-2 text-sm leading-6 text-slate-500'>{state.message}</p><button type='button' onClick={() => setAttempt((value) => value + 1)} className='mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900'><RefreshCw size={16} aria-hidden='true' /> Try again</button></>}
      </section>
    </main>
  );
}
