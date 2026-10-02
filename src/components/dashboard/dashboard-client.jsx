'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, CircleAlert, Fingerprint, LoaderCircle, LogOut, Plus, Search, UsersRound, Wrench, ShieldCheck } from 'lucide-react';

const MEMBER_READ_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'COMMUNICATIONS']);

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || 'The request could not be completed.');
  return payload.data;
}

export default function DashboardClient() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);

  const activeTenant = useMemo(() => tenants.find((tenant) => tenant.id === tenantId) || null, [tenants, tenantId]);
  const canReadMemberDirectory = Boolean(activeTenant && MEMBER_READ_ROLES.has(activeTenant.role));
  const canManageMembers = Boolean(activeTenant && ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'REGISTRAR'].includes(activeTenant.role));
  const visibleMembers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => [member.full_name, member.email, member.phone].filter(Boolean).some((value) => value.toLowerCase().includes(needle)));
  }, [members, search]);

  const loadMembers = useCallback(async (id) => {
    if (!id) { setMembers([]); return; }
    const params = new URLSearchParams({ tenant_id: id });
    setMembers(await readJson(await fetch(`/api/v1/members?${params.toString()}`, { cache: 'no-store' })));
  }, []);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const session = await readJson(await fetch('/api/v1/auth/session', { cache: 'no-store' }));
      setUser(session.user);
      const list = await readJson(await fetch('/api/v1/tenants', { cache: 'no-store' }));
      setTenants(list);
      const selected = tenantId && list.some((tenant) => tenant.id === tenantId) ? tenantId : list[0]?.id || '';
      const selectedTenant = list.find((tenant) => tenant.id === selected);
      setTenantId(selected);
      if (selected && MEMBER_READ_ROLES.has(selectedTenant?.role)) await loadMembers(selected);
      else setMembers([]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to load your workspace.';
      if (/sign in|session has expired|unauthenticated/i.test(message)) { router.replace('/login'); return; }
      setError(message);
    } finally { setLoading(false); }
  }, [loadMembers, router, tenantId]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadWorkspace();
    });
    return () => { active = false; };
  }, [loadWorkspace]);

  async function createTenant(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const name = tenantName.trim();
    const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
    try {
      await readJson(await fetch('/api/v1/tenants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, slug }) }));
      setTenantName('');
      setShowTenantForm(false);
      await loadWorkspace();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create workspace.'); }
    finally { setSaving(false); }
  }

  async function createMember(event) {
    event.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    setError('');
    try {
      await readJson(await fetch('/api/v1/members', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId }, body: JSON.stringify({ full_name: memberName, email: memberEmail, phone: memberPhone }) }));
      setMemberName(''); setMemberEmail(''); setMemberPhone(''); setShowMemberForm(false);
      await loadMembers(tenantId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the member.'); }
    finally { setSaving(false); }
  }

  async function signOut() {
    setSaving(true);
    try { await fetch('/api/v1/auth/logout', { method: 'POST' }); }
    finally { router.replace('/login'); router.refresh(); setSaving(false); }
  }

  return (
    <main className='min-h-screen flex-1 bg-[#f6f8f7] text-slate-950'>
      <header className='sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur'><div className='mx-auto flex min-h-[72px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-7'>
        <Link href='/' className='flex min-w-0 items-center gap-3'><span className='grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-800 text-white'><Fingerprint size={21} aria-hidden='true' /></span><span><span className='block text-base font-semibold tracking-tight'>MKS Register</span><span className='hidden text-xs text-slate-500 sm:block'>Church operations</span></span></Link>
        <div className='flex items-center gap-3'>{user?.email ? <span className='hidden max-w-48 truncate text-sm text-slate-500 sm:block'>{user.email}</span> : null}<button type='button' onClick={signOut} disabled={saving} className='inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60'><LogOut size={16} aria-hidden='true' /><span className='hidden sm:inline'>Sign out</span></button></div>
      </div></header>

      <div className='mx-auto grid max-w-[1440px] gap-7 px-4 py-7 sm:px-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-10'>
        <aside className='hidden lg:block'><div className='sticky top-28'><p className='px-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400'>Workspace</p><div className='mt-3 rounded-2xl border border-slate-200 bg-white p-2'><div className='flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-3 text-emerald-900'><UsersRound size={18} aria-hidden='true' /><span className='text-sm font-semibold'>Members</span></div></div><div className='mt-5 rounded-2xl border border-slate-200 bg-white p-4'><p className='text-sm font-semibold'>Tenant isolation</p><p className='mt-2 text-xs leading-5 text-slate-500'>Workspace membership is checked by the API, and MongoDB records are scoped to the active tenant.</p></div></div></aside>

        <section className='min-w-0'>
          <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-end'><div><p className='text-sm font-semibold text-emerald-800'>MANAGEMENT</p><h1 className='mt-2 text-3xl font-semibold tracking-tight sm:text-4xl'>Member directory</h1><p className='mt-2 max-w-2xl text-sm leading-6 text-slate-500'>Manage people records for the workspace you have selected.</p></div><div className='flex flex-wrap gap-2'><Link href='/dashboard/security' className='inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'><ShieldCheck size={16} aria-hidden='true' /> Security</Link><Link href='/dashboard/operations' className='inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'><Wrench size={16} aria-hidden='true' /> Operations</Link><button type='button' onClick={() => setShowTenantForm((value) => !value)} className='inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'><Plus size={16} aria-hidden='true' /> New workspace</button>{canManageMembers ? <button type='button' onClick={() => setShowMemberForm((value) => !value)} disabled={!activeTenant} className='inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50'><Plus size={16} aria-hidden='true' /> Add member</button> : null}</div></div>

          {error ? <div role='alert' className='mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-800'><CircleAlert size={18} className='mt-0.5 shrink-0' aria-hidden='true' /><p>{error}</p></div> : null}

          {showTenantForm ? <form onSubmit={createTenant} className='mt-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm'><h2 className='font-semibold'>Create a workspace</h2><p className='mt-1 text-sm text-slate-500'>Each workspace has its own tenant ID and membership boundary.</p><div className='mt-4 flex flex-col gap-3 sm:flex-row'><label className='flex-1'><span className='mb-1.5 block text-sm font-medium'>Church or organization name</span><input required minLength={2} maxLength={120} value={tenantName} onChange={(event) => setTenantName(event.target.value)} className='min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='e.g. MKS Community Church' /></label><div className='flex items-end gap-2'><button type='submit' disabled={saving} className='min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-60'>{saving ? 'Creating…' : 'Create'}</button><button type='button' onClick={() => setShowTenantForm(false)} className='min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-50'>Cancel</button></div></div></form> : null}

          {!loading && tenants.length > 0 ? <div className='mt-7 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between'><label className='min-w-0 flex-1'><span className='mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500'>Current workspace</span><select value={tenantId} onChange={async (event) => { const id = event.target.value; const selectedTenant = tenants.find((tenant) => tenant.id === id); setTenantId(id); setError(''); try { if (MEMBER_READ_ROLES.has(selectedTenant?.role)) await loadMembers(id); else setMembers([]); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load members.'); } }} className='min-h-11 w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10'>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.role}</option>)}</select></label><div className='text-sm text-slate-500'><span className='font-semibold text-slate-900'>{members.length}</span> records loaded</div></div> : null}

          {showMemberForm && activeTenant ? <form onSubmit={createMember} className='mt-5 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm'><h2 className='font-semibold'>Add a member</h2><p className='mt-1 text-sm text-slate-500'>This record will be saved to <span className='font-medium text-slate-700'>{activeTenant.name}</span>.</p><div className='mt-4 grid gap-4 md:grid-cols-3'><label><span className='mb-1.5 block text-sm font-medium'>Full name *</span><input required minLength={2} maxLength={160} value={memberName} onChange={(event) => setMemberName(event.target.value)} className='min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='Full name' /></label><label><span className='mb-1.5 block text-sm font-medium'>Email address</span><input type='email' maxLength={254} value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} className='min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='name@example.org' /></label><label><span className='mb-1.5 block text-sm font-medium'>Phone</span><input type='tel' maxLength={40} value={memberPhone} onChange={(event) => setMemberPhone(event.target.value)} className='min-h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='+254…' /></label></div><div className='mt-5 flex justify-end gap-2'><button type='button' onClick={() => setShowMemberForm(false)} className='min-h-10 rounded-xl px-4 text-sm font-semibold text-slate-500 hover:bg-slate-50'>Cancel</button><button type='submit' disabled={saving} className='min-h-10 rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white disabled:opacity-60'>{saving ? 'Saving…' : 'Save member'}</button></div></form> : null}

          {loading ? <div className='mt-7 rounded-2xl border border-slate-200 bg-white p-12 text-center'><LoaderCircle size={24} className='mx-auto animate-spin text-emerald-800' aria-hidden='true' /><p className='mt-3 text-sm text-slate-500'>Loading your workspace…</p></div> : null}
          {!loading && tenants.length === 0 ? <div className='mt-7 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center'><span className='mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800'><Building2 size={24} aria-hidden='true' /></span><h2 className='mt-5 text-xl font-semibold'>Set up your first workspace</h2><p className='mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500'>No organization is linked to this account yet. Create a workspace to establish its isolated member directory.</p><button type='button' onClick={() => setShowTenantForm(true)} className='mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900'><Plus size={16} aria-hidden='true' /> Create workspace</button></div> : null}
          {!loading && tenants.length > 0 && canReadMemberDirectory ? <div className='mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white'><div className='flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between'><div><h2 className='font-semibold'>Member records</h2><p className='mt-1 text-xs text-slate-500'>Showing up to 100 most recently created records.</p></div><label className='relative block w-full sm:max-w-xs'><Search size={16} className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400' aria-hidden='true' /><input value={search} onChange={(event) => setSearch(event.target.value)} className='min-h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10' placeholder='Search name or contact' aria-label='Search member records' /></label></div>
            {visibleMembers.length === 0 ? <div className='px-5 py-14 text-center'><span className='mx-auto grid size-12 place-items-center rounded-xl bg-slate-50 text-slate-400'><UsersRound size={22} aria-hidden='true' /></span><h3 className='mt-4 font-semibold'>{members.length === 0 ? 'No member records yet' : 'No matching members'}</h3><p className='mt-1 text-sm text-slate-500'>{members.length === 0 ? 'Add your first record to begin building this directory.' : 'Try another name, email, or phone number.'}</p></div> : <div className='overflow-x-auto'><table className='w-full min-w-[620px] text-left text-sm'><thead className='bg-slate-50 text-xs uppercase tracking-wide text-slate-500'><tr><th scope='col' className='px-5 py-3.5 font-semibold'>Member</th><th scope='col' className='px-5 py-3.5 font-semibold'>Contact</th><th scope='col' className='px-5 py-3.5 font-semibold'>Status</th><th scope='col' className='px-5 py-3.5 font-semibold'>Added</th></tr></thead><tbody className='divide-y divide-slate-100'>{visibleMembers.map((member) => <tr key={member.id} className='transition hover:bg-slate-50/70'><td className='px-5 py-4 font-semibold text-slate-900'>{member.full_name}</td><td className='px-5 py-4'><span className='block text-slate-700'>{member.email || '—'}</span><span className='mt-1 block text-xs text-slate-500'>{member.phone || 'No phone provided'}</span></td><td className='px-5 py-4'><span className='inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800'>{member.membership_status}</span></td><td className='px-5 py-4 text-slate-500'>{member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div>}
          </div> : null}
          {!loading && tenants.length > 0 && !canReadMemberDirectory ? <div className='mt-5 rounded-2xl border border-slate-200 bg-white p-7'><h2 className='font-semibold'>Member directory access is restricted</h2><p className='mt-2 text-sm leading-6 text-slate-500'>Your current workspace role does not include permission to browse member records. You can still use the tools available to your role.</p><Link href='/dashboard/operations' className='mt-4 inline-flex min-h-10 items-center rounded-xl bg-emerald-800 px-4 text-sm font-semibold text-white'>Open available operations</Link></div> : null}
          <p className='mt-5 text-xs leading-5 text-slate-400'>Member data is loaded from your configured database. If the service is not configured, the app shows an error instead of sample records.</p>
        </section>
      </div>
    </main>
  );
}
