import Link from 'next/link';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import ForgotPasswordForm from '@/components/auth/forgot-password-form';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <main className='flex min-h-screen flex-1 bg-[#f7f8fa] text-slate-950'>
      <section className='relative hidden w-[44%] flex-col justify-between overflow-hidden bg-emerald-950 p-12 text-white lg:flex'>
        <div className='absolute -right-32 -top-24 size-[28rem] rounded-full border border-white/10' />
        <div className='absolute -right-12 top-24 size-[21rem] rounded-full border border-white/10' />
        <Link href='/' className='relative flex items-center gap-3'><span className='grid size-11 place-items-center rounded-2xl bg-white/10'><Fingerprint size={24} aria-hidden='true' /></span><span><span className='block text-lg font-semibold'>MKS Register</span><span className='block text-xs text-emerald-100/70'>Church operations platform</span></span></Link>
        <div className='relative max-w-lg'><p className='text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200'>Account recovery</p><h1 className='mt-5 text-4xl font-semibold leading-tight tracking-tight'>A secure way back into your workspace.</h1><p className='mt-5 leading-7 text-emerald-100/75'>We’ll send reset instructions if an account exists for the email address you provide.</p></div>
        <p className='relative text-xs text-emerald-100/60'>Private workspace access · Secure recovery links</p>
      </section>
      <section className='flex flex-1 items-center justify-center px-5 py-12 sm:px-10'><div className='w-full max-w-md'>
        <Link href='/login' className='mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-800'>← Back to sign in</Link>
        <div className='rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9'><span className='grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800'><ShieldCheck size={23} aria-hidden='true' /></span><p className='mt-6 text-sm font-semibold text-emerald-800'>SECURE ACCOUNT RECOVERY</p><h2 className='mt-2 text-3xl font-semibold tracking-tight'>Forgot your password?</h2><p className='mt-3 text-sm leading-6 text-slate-500'>Enter the email address associated with your account. For your privacy, we’ll show the same confirmation either way.</p><div className='mt-8'><ForgotPasswordForm /></div></div>
        <p className='mt-6 text-center text-xs text-slate-400'>Never share a password-reset link with anyone.</p>
      </div></section>
    </main>
  );
}
