import Link from 'next/link';
import { Fingerprint } from 'lucide-react';
import LoginForm from '@/components/auth/login-form';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className='flex min-h-screen flex-1 bg-[#f7f8fa] text-slate-950'>
      <section className='relative hidden w-[44%] flex-col justify-between overflow-hidden bg-emerald-950 p-12 text-white lg:flex'>
        <div className='absolute -right-32 -top-24 size-[28rem] rounded-full border border-white/10' />
        <div className='absolute -right-12 top-24 size-[21rem] rounded-full border border-white/10' />
        <Link href='/' className='relative flex items-center gap-3'><span className='grid size-11 place-items-center rounded-2xl bg-white/10'><Fingerprint size={24} aria-hidden='true' /></span><span><span className='block text-lg font-semibold'>MKS Register</span><span className='block text-xs text-emerald-100/70'>Church operations platform</span></span></Link>
        <div className='relative max-w-lg'><p className='text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200'>A trusted place to begin</p><h1 className='mt-5 text-4xl font-semibold leading-tight tracking-tight'>Good stewardship starts with reliable records.</h1><p className='mt-5 leading-7 text-emerald-100/75'>Sign in to manage your organization’s member records and keep administrative work connected.</p></div>
        <p className='relative text-xs text-emerald-100/60'>Private workspace access · Tenant-aware permissions</p>
      </section>
      <section className='flex flex-1 items-center justify-center px-5 py-12 sm:px-10'><div className='w-full max-w-md'>
        <Link href='/' className='mb-10 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-emerald-800 lg:hidden'><Fingerprint size={20} aria-hidden='true' /> MKS Register</Link>
        <div className='rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9'><p className='text-sm font-semibold text-emerald-800'>WELCOME BACK</p><h2 className='mt-2 text-3xl font-semibold tracking-tight'>Sign in to your workspace</h2><p className='mt-3 text-sm leading-6 text-slate-500'>Use the account provided by your organization’s administrator.</p><div className='mt-8'><LoginForm /></div><div className='mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm'><Link href='/forgot-password' className='font-semibold text-emerald-800 hover:underline'>Forgot password?</Link><Link href='/register' className='font-semibold text-emerald-800 hover:underline'>Create account</Link></div><p className='mt-3 text-xs leading-5 text-slate-500'>Your session is stored in HTTP-only cookies. Workspace access is controlled by membership permissions.</p></div>
        <p className='mt-6 text-center text-xs text-slate-400'>Follow your organization’s data-handling policies when using member information.</p>
      </div></section>
    </main>
  );
}
