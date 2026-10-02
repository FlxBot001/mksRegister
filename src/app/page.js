import Link from 'next/link';
import { ArrowRight, CalendarCheck2, CheckCircle2, Fingerprint, ShieldCheck, UsersRound } from 'lucide-react';

const capabilities = [
  { icon: UsersRound, title: 'A trusted people directory', description: 'Organize member records with consistent fields and clear ownership.' },
  { icon: CalendarCheck2, title: 'Services and attendance', description: 'Build dependable attendance history connected to service sessions.' },
  { icon: ShieldCheck, title: 'Tenant-aware access', description: 'Keep each organization within its own server and database access boundary.' },
];

export default function Home() {
  return (
    <main className='min-h-screen overflow-hidden bg-[#f7f8fa] text-slate-950'>
      <div className='absolute inset-x-0 top-0 -z-0 h-[34rem] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-100/80 via-[#f7f8fa] to-[#f7f8fa]' />
      <header className='relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8'>
        <Link href='/' className='flex items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700'>
          <span className='grid size-11 place-items-center rounded-2xl bg-emerald-800 text-white shadow-lg shadow-emerald-900/15'><Fingerprint size={23} aria-hidden='true' /></span>
          <span><span className='block text-lg font-semibold tracking-tight'>MKS Register</span><span className='block text-xs font-medium text-slate-500'>Church operations platform</span></span>
        </Link>
        <nav aria-label='Main navigation' className='flex items-center gap-2 sm:gap-3'>
          <Link href='/login' className='rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white sm:px-4'>Sign in</Link>
          <Link href='/login' className='inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 sm:px-4'>Open workspace <ArrowRight size={16} aria-hidden='true' /></Link>
        </nav>
      </header>

      <section className='relative z-10 mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:pb-28 lg:pt-24'>
        <div>
          <div className='mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3.5 py-2 text-xs font-semibold tracking-wide text-emerald-900 shadow-sm'><span className='size-2 rounded-full bg-emerald-600' /> BUILT FOR TRUSTED CHURCH ADMINISTRATION</div>
          <h1 className='max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-6xl'>People, services, and attendance — <span className='text-emerald-800'>connected with care.</span></h1>
          <p className='mt-6 max-w-2xl text-lg leading-8 text-slate-600'>MKS Register gives church teams a clear, secure foundation for member registration and attendance management, with each organization’s records kept within its own tenant boundary.</p>
          <div className='mt-9 flex flex-col gap-3 sm:flex-row'>
            <Link href='/login' className='inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700'>Sign in to your workspace <ArrowRight size={17} aria-hidden='true' /></Link>
            <a href='#capabilities' className='inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white'>Explore the platform</a>
          </div>
          <div className='mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500'>{['Organization-level isolation', 'Role-aware access', 'Responsive by design'].map((item) => <span key={item} className='inline-flex items-center gap-2'><CheckCircle2 size={16} className='text-emerald-700' aria-hidden='true' />{item}</span>)}</div>
        </div>

        <div className='relative'>
          <div className='absolute -inset-4 rounded-[2rem] bg-emerald-900/5 blur-2xl' />
          <div className='relative rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-7'>
            <div className='flex items-start justify-between gap-4 border-b border-slate-100 pb-5'><div><p className='text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800'>Workspace overview</p><h2 className='mt-2 text-xl font-semibold tracking-tight'>A clearer view of your church</h2><p className='mt-1 text-sm text-slate-500'>A focused space for everyday administration.</p></div><span className='grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-800'><ShieldCheck size={22} aria-hidden='true' /></span></div>
            <div className='grid gap-3 py-5 sm:grid-cols-2'>
              <div className='rounded-2xl border border-slate-100 bg-slate-50 p-4'><p className='text-sm font-medium text-slate-500'>Member records</p><p className='mt-3 text-sm font-semibold'>One organized directory</p><p className='mt-1 text-xs leading-5 text-slate-500'>Find and maintain records with consistent fields.</p></div>
              <div className='rounded-2xl border border-slate-100 bg-slate-50 p-4'><p className='text-sm font-medium text-slate-500'>Attendance</p><p className='mt-3 text-sm font-semibold'>A dependable history</p><p className='mt-1 text-xs leading-5 text-slate-500'>Connect service sessions to attendance records.</p></div>
              <div className='rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2'><div className='flex items-center gap-3'><span className='grid size-9 place-items-center rounded-xl bg-white text-emerald-800 ring-1 ring-slate-200'><Fingerprint size={19} aria-hidden='true' /></span><div><p className='text-sm font-semibold'>Designed around tenant boundaries</p><p className='mt-1 text-xs leading-5 text-slate-500'>Membership and role checks happen on the server; database policies add another layer of isolation.</p></div></div></div>
            </div>
            <p className='rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900'>Workspace data appears after sign-in and setup. This page contains no sample attendance or membership statistics.</p>
          </div>
        </div>
      </section>

      <section id='capabilities' className='relative z-10 border-t border-slate-200/80 bg-white py-20'>
        <div className='mx-auto w-full max-w-7xl px-5 sm:px-8'><div className='max-w-2xl'><p className='text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800'>A practical foundation</p><h2 className='mt-3 text-3xl font-semibold tracking-tight sm:text-4xl'>Built for the work behind every service.</h2><p className='mt-4 leading-7 text-slate-600'>Start with dependable records and access boundaries, then expand into attendance operations, reporting, and growth insights as each layer is implemented and verified.</p></div>
          <div className='mt-10 grid gap-4 md:grid-cols-3'>{capabilities.map(({ icon: Icon, title, description }) => <article key={title} className='rounded-2xl border border-slate-200 bg-[#fbfcfd] p-6 transition hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg hover:shadow-slate-900/5'><span className='grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-800'><Icon size={21} aria-hidden='true' /></span><h3 className='mt-5 text-lg font-semibold'>{title}</h3><p className='mt-2 text-sm leading-6 text-slate-600'>{description}</p></article>)}</div>
        </div>
      </section>
      <footer className='border-t border-slate-200 bg-[#f7f8fa]'><div className='mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8'><p>© {new Date().getFullYear()} MKS Register</p><p>Church records deserve clarity, privacy, and care.</p></div></footer>
    </main>
  );
}
