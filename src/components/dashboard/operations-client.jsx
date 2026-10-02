'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, FileBarChart2, LoaderCircle, MailPlus, RefreshCw, ShieldCheck, UsersRound, Wrench } from 'lucide-react';

const MEMBER_READ_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'COMMUNICATIONS']);

const TABS = [
  { id: 'services', label: 'Services', icon: Wrench },
  { id: 'attendance', label: 'Attendance', icon: ClipboardList, roles: ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER'] },
  { id: 'reports', label: 'Reports', icon: FileBarChart2, roles: ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'REPORT_VIEWER'] },
  { id: 'invitations', label: 'Invitations', icon: MailPlus, roles: ['OWNER', 'ADMIN', 'MANAGER'] },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck, roles: ['OWNER', 'ADMIN'] },
  { id: 'import', label: 'CSV import', icon: UsersRound, roles: ['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR'] },
];

async function api(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error?.message || 'The request failed.');
  return result.data;
}

export default function OperationsClient() {
  const router = useRouter();
  const [tab, setTab] = useState('services');
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [members, setMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [permissionEdits, setPermissionEdits] = useState({});
  const [report, setReport] = useState(null);
  const [memberId, setMemberId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [history, setHistory] = useState(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [status, setStatus] = useState('PRESENT');
  const [notes, setNotes] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('REPORT_VIEWER');
  const [csv, setCsv] = useState('full_name,email,phone\n');
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [lastInviteUrl, setLastInviteUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadCore = useCallback(async (id, allowMemberRead = true) => {
    if (!id) return;
    const q = new URLSearchParams({ tenant_id: id });
    const [m, s] = await Promise.all([allowMemberRead ? api('/api/v1/members?' + q) : Promise.resolve([]), api('/api/v1/services?' + q)]);
    setMembers(m); setServices(s);
    setMemberId((prev) => m.some((x) => x.id === prev) ? prev : m[0]?.id || '');
    setServiceId((prev) => s.some((x) => x.id === prev) ? prev : s[0]?.id || '');
  }, []);

  const loadTab = useCallback(async (id, selected = 'services', range = {}) => {
    if (!id) return;
    const q = new URLSearchParams({ tenant_id: id });
    if (selected === 'attendance') setAttendance(await api('/api/v1/attendance?' + q));
    if (selected === 'reports') { const from = range.from || new Date(Date.now() - 30 * 86400000).toISOString(); const to = range.to || new Date().toISOString(); setReport(await api('/api/v1/reports/attendance?' + new URLSearchParams({ tenant_id: id, from, to }))); }
    if (selected === 'invitations') setInvitations(await api('/api/v1/invitations?' + q));
    if (selected === 'permissions') setPermissions(await api('/api/v1/tenants/' + encodeURIComponent(id) + '/memberships'));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      setLoading(true); setError('');
      try {
        const list = await api('/api/v1/tenants');
        if (!active) return;
        setTenants(list);
        const id = list[0]?.id || '';
        const selectedRole = list[0]?.role || '';
        setTenantId(id);
        if (id) { await loadCore(id, MEMBER_READ_ROLES.has(selectedRole)); await loadTab(id, 'services'); }
      } catch (e) {
        if (/sign in|session|unauthenticated/i.test(e.message)) router.replace('/login');
        else setError(e.message);
      } finally { if (active) setLoading(false); }
    });
    return () => { active = false; };
  }, [loadCore, loadTab, router]);

  async function refresh() {
    if (!tenantId) return;
    setLoading(true); setError('');
    try { await loadCore(tenantId); await loadTab(tenantId); setMessage('Workspace data refreshed.'); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function submit(action) {
    setSaving(true); setError(''); setMessage(''); setLastInviteUrl('');
    try { await action(); setMessage('Changes saved successfully.'); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function createService(event) {
    event.preventDefault();
    await submit(async () => {
      await api('/api/v1/services', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId }, body: JSON.stringify({ name: serviceName, description: serviceDescription }) });
      setServiceName(''); setServiceDescription(''); await loadCore(tenantId);
    });
  }

  async function recordAttendance(event) {
    event.preventDefault();
    await submit(async () => {
      await api('/api/v1/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId }, body: JSON.stringify({ member_id: memberId, service_id: serviceId, status, notes }) });
      setNotes(''); await loadTab(tenantId, 'attendance');
    });
  }

  async function loadHistory() {
    if (!memberId) return;
    await submit(async () => {
      const q = new URLSearchParams({ tenant_id: tenantId, member_id: memberId });
      setHistory(await api('/api/v1/attendance/history?' + q));
    });
  }

  async function createInvitation(event) {
    event.preventDefault();
    await submit(async () => {
      const data = await api('/api/v1/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
      setInviteEmail(''); setLastInviteUrl(data.invitation_url || ''); await loadTab(tenantId, 'invitations');
    });
  }

  async function savePermission(userId) {
    const edit = permissionEdits[userId] || {};
    await submit(async () => {
      const data = await api('/api/v1/tenants/' + encodeURIComponent(tenantId) + '/memberships', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, ...edit }) });
      setPermissions((prev) => prev.map((item) => item.user_id === userId ? { ...item, ...data } : item));
      setPermissionEdits((prev) => { const next = { ...prev }; delete next[userId]; return next; });
      await loadTab(tenantId, 'permissions');
    });
  }

  async function importCsv(event) {
    event.preventDefault();
    await submit(async () => {
      const data = await api('/api/v1/import/members', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId }, body: JSON.stringify({ csv }) });
      setMessage('Imported ' + data.imported + ' member records.');
      await loadCore(tenantId);
    });
  }

  const inputClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10';
  const buttonClass = 'min-h-11 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50';
  const activeTenant = tenants.find((x) => x.id === tenantId);
  const role = activeTenant?.role || '';
  const visibleTabs = TABS.filter((item) => !item.roles || item.roles.includes(role));
  const canManageServices = ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT'].includes(role);
  const canRecordAttendance = ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'REGISTRAR', 'ATTENDANCE_OFFICER'].includes(role);
  const inviteRoles = role === 'OWNER' ? ['REPORT_VIEWER', 'VOLUNTEER', 'MEMBER', 'COMMUNICATIONS', 'ATTENDANCE_OFFICER', 'REGISTRAR', 'GROUP_LEADER', 'MINISTRY_LEADER', 'PASTOR', 'MANAGER', 'MANAGEMENT', 'ADMIN'] : ['REPORT_VIEWER', 'VOLUNTEER', 'MEMBER', 'COMMUNICATIONS', 'ATTENDANCE_OFFICER', 'REGISTRAR', 'GROUP_LEADER', 'MINISTRY_LEADER', 'PASTOR', 'MANAGER'];
  const allPermissionRoles = ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'COMMUNICATIONS', 'REPORT_VIEWER', 'VOLUNTEER', 'MEMBER'];
  const permissionRoles = role === 'OWNER' ? allPermissionRoles : allPermissionRoles.filter((item) => !['OWNER', 'ADMIN', 'MANAGEMENT'].includes(item));

  return <main className='min-h-screen bg-[#f6f8f7] text-slate-950'>
    <header className='border-b border-slate-200 bg-white'><div className='mx-auto flex min-h-[72px] max-w-6xl items-center justify-between px-4 sm:px-7'><Link href='/dashboard' className='inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-800'><ArrowLeft size={17} /> Back to members</Link><span className='font-semibold'>MKS Register · Operations</span><button type='button' onClick={refresh} className='inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold'><RefreshCw size={15} /> Refresh</button></div></header>
    <div className='mx-auto max-w-6xl px-4 py-8 sm:px-7'>
      <p className='text-sm font-semibold text-emerald-800'>WORKSPACE TOOLS</p><h1 className='mt-2 text-3xl font-semibold tracking-tight'>Operations and reporting</h1><p className='mt-2 text-sm text-slate-500'>Manage services, record attendance, invite staff, import members and review attendance summaries.</p>
      {tenants.length > 0 && <label className='mt-6 block max-w-xl'><span className='mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500'>Workspace</span><select className={inputClass} value={tenantId} onChange={async (e) => { const id = e.target.value; setTenantId(id); setTab('services'); setError(''); setHistory(null); try { await loadCore(id, MEMBER_READ_ROLES.has(tenants.find((item) => item.id === id)?.role)); await loadTab(id); } catch (err) { setError(err.message); } }} >{tenants.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.role}</option>)}</select></label>}
      {error && <div role='alert' className='mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800'>{error}</div>}
      {message && <div role='status' className='mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900'>{message}</div>}
      {loading && <div className='mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500'><LoaderCircle className='animate-spin' size={20} /> Loading workspace…</div>}
      {!loading && tenants.length === 0 && <div className='mt-6 rounded-2xl border border-slate-200 bg-white p-8'><p className='font-semibold'>No workspace found.</p><Link className='mt-2 inline-block text-sm text-emerald-800 underline' href='/dashboard'>Create a workspace on the dashboard.</Link></div>}
      {!loading && activeTenant && <>
        <nav className='mt-7 flex flex-wrap gap-2' aria-label='Operations sections'>{visibleTabs.map(({ id, label, icon: Icon }) => <button key={id} type='button' onClick={async () => { setTab(id); setError(''); try { await loadTab(tenantId, id); } catch (e) { setError(e.message); } }} className={'inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold ' + (tab === id ? 'bg-emerald-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}><Icon size={16} />{label}</button>)}</nav>
        {tab === 'services' && <section className='mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]'>
          <div className='rounded-2xl border border-slate-200 bg-white p-5'><h2 className='font-semibold'>Services and events</h2><p className='mt-1 text-sm text-slate-500'>Create and archive attendance sessions for this workspace.</p>{services.length === 0 ? <p className='mt-6 rounded-xl bg-slate-50 p-5 text-sm text-slate-500'>No services yet.</p> : <ul className='mt-4 divide-y divide-slate-100'>{services.map((s) => <li key={s.id} className='flex items-start justify-between gap-3 py-3'><div><p className='font-semibold'>{s.name}</p><p className='mt-1 text-sm text-slate-500'>{s.description || 'No description'}</p></div>{canManageServices ? <button type='button' disabled={saving} onClick={() => submit(async () => { await api('/api/v1/services/' + s.id + '?tenant_id=' + encodeURIComponent(tenantId), { method: 'DELETE' }); await loadCore(tenantId); })} className='rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600'>Archive</button> : null}</li>)}</ul>}</div>
{canManageServices && (
          <form onSubmit={createService} className='rounded-2xl border border-slate-200 bg-white p-5'><h2 className='font-semibold'>Add service</h2><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Service name</span><input required minLength={2} maxLength={120} className={inputClass} value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder='Sunday service' /></label><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Description</span><textarea maxLength={1000} rows={3} className={inputClass} value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder='Optional notes' /></label><button disabled={saving} className={'mt-4 ' + buttonClass}>Create service</button></form>
          )}
        </section>}
        {tab === 'attendance' && <section className='mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]'>
{canRecordAttendance && (
          <form onSubmit={recordAttendance} className='rounded-2xl border border-slate-200 bg-white p-5'><h2 className='font-semibold'>Record attendance</h2><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Member</span><select required className={inputClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}><option value=''>Choose a member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Service</span><select required className={inputClass} value={serviceId} onChange={(e) => setServiceId(e.target.value)}><option value=''>Choose a service</option>{services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Status</span><select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>{['PRESENT','LATE','ABSENT','EXCUSED'].map((s) => <option key={s}>{s}</option>)}</select></label><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Notes</span><textarea maxLength={1000} rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></label><button disabled={saving || !memberId || !serviceId} className={'mt-4 ' + buttonClass}>Save attendance</button></form>
          )}

          <div className='rounded-2xl border border-slate-200 bg-white p-5'><div className='flex items-start justify-between gap-3'><div><h2 className='font-semibold'>Individual attendance history</h2><p className='mt-1 text-sm text-slate-500'>Review a member’s recent attendance.</p></div><button type='button' onClick={loadHistory} disabled={saving || !memberId} className='rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold'>Load history</button></div>{history && <><p className='mt-4 font-medium'>{history.member.full_name}</p><ul className='mt-2 divide-y divide-slate-100'>{history.records.map((r) => <li key={r.id} className='flex items-center justify-between gap-3 py-3'><div><p className='text-sm font-semibold'>{r.service_name}</p><p className='mt-1 text-xs text-slate-500'>{new Date(r.recorded_at).toLocaleString()}</p></div><span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold'>{r.status}</span></li>)}</ul>{history.records.length === 0 && <p className='mt-3 text-sm text-slate-500'>No attendance records for this member.</p>}</>}</div>
          <div className='rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2'><div className='flex items-center justify-between gap-3'><div><h2 className='font-semibold'>Recent attendance</h2><p className='mt-1 text-sm text-slate-500'>Latest records for this workspace.</p></div><button type='button' onClick={() => loadTab(tenantId, 'attendance')} className='rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold'>Reload</button></div><div className='mt-4 overflow-x-auto'><table className='w-full min-w-[520px] text-left text-sm'><thead className='text-xs uppercase text-slate-500'><tr><th className='py-2'>Member</th><th>Service</th><th>Status</th><th>Date</th></tr></thead><tbody className='divide-y divide-slate-100'>{attendance.map((r) => <tr key={r.id}><td className='py-3'>{r.member_name}</td><td>{r.service_name}</td><td>{r.status}</td><td>{new Date(r.recorded_at).toLocaleString()}</td></tr>)}</tbody></table></div></div>
        </section>}
        {tab === 'reports' && <section className='mt-5 rounded-2xl border border-slate-200 bg-white p-5'><div className='flex flex-wrap items-end gap-3'><label><span className='mb-1.5 block text-sm font-medium'>From</span><input type='date' className={inputClass} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label><label><span className='mb-1.5 block text-sm font-medium'>To</span><input type='date' className={inputClass} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label><button type='button' className={buttonClass} onClick={() => submit(() => loadTab(tenantId, 'reports', { from: new Date(dateFrom + 'T00:00:00').toISOString(), to: new Date(dateTo + 'T23:59:59').toISOString() }))}>Generate report</button></div>{report && <><div className='mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>{[['Attendance records',report.totals.total],['Present',report.totals.present],['Late',report.totals.late],['Absent',report.totals.absent],['Attendance rate',report.totals.attendance_rate + '%']].map(([label,value]) => <div key={label} className='rounded-xl bg-slate-50 p-4'><p className='text-xs font-semibold text-slate-500'>{label}</p><p className='mt-2 text-2xl font-semibold'>{value}</p></div>)}</div><h3 className='mt-6 font-semibold'>By service</h3><ul className='mt-2 divide-y divide-slate-100'>{report.by_service.map((s) => <li key={s.service_id} className='flex justify-between gap-3 py-3 text-sm'><span>{s.service_name}</span><span className='text-slate-500'>{s.present} present / {s.total} records</span></li>)}</ul><h3 className='mt-6 font-semibold'>Daily volume</h3><ul className='mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>{report.by_day.map((d) => <li key={d.date} className='flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm'><span>{d.date}</span><span className='font-semibold'>{d.count}</span></li>)}</ul><p className='mt-5 text-sm text-slate-500'>Active members: {report.active_members} · Active services: {report.active_services}</p></>}</section>}
        {tab === 'invitations' && <section className='mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]'><form onSubmit={createInvitation} className='rounded-2xl border border-slate-200 bg-white p-5'><h2 className='font-semibold'>Invite a teammate</h2><p className='mt-1 text-sm text-slate-500'>Invitation links expire after seven days.</p><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Email</span><input type='email' required maxLength={254} className={inputClass} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></label><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>Role</span><select className={inputClass} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>{inviteRoles.map((r) => <option key={r}>{r}</option>)}</select></label><button disabled={saving} className={'mt-4 ' + buttonClass}>Create invitation</button>{lastInviteUrl && <div className='mt-4 break-all rounded-xl bg-emerald-50 p-3 text-sm'><p className='font-semibold'>Invitation link (share securely)</p><p className='mt-1'>{lastInviteUrl}</p><button type='button' onClick={() => navigator.clipboard?.writeText(lastInviteUrl)} className='mt-2 font-semibold text-emerald-900 underline'>Copy link</button></div>}</form><div className='rounded-2xl border border-slate-200 bg-white p-5'><h2 className='font-semibold'>Recent invitations</h2><ul className='mt-3 divide-y divide-slate-100'>{invitations.map((i) => <li key={i.id} className='py-3'><p className='font-medium'>{i.email}</p><p className='mt-1 text-xs text-slate-500'>{i.role} · {i.status} · Expires {new Date(i.expires_at).toLocaleDateString()}</p></li>)}</ul>{invitations.length === 0 && <p className='mt-4 text-sm text-slate-500'>No invitations found.</p>}</div></section>}
        {tab === 'permissions' && <section className='mt-5 rounded-2xl border border-slate-200 bg-white p-5'><h2 className='font-semibold'>Workspace roles and access</h2><p className='mt-1 text-sm text-slate-500'>Only owners and administrators can change permissions. The workspace must retain at least one active owner.</p><div className='mt-4 overflow-x-auto'><table className='w-full min-w-[760px] text-left text-sm'><thead className='bg-slate-50 text-xs uppercase text-slate-500'><tr><th className='px-3 py-3'>User ID</th><th className='px-3 py-3'>Role</th><th className='px-3 py-3'>Status</th><th className='px-3 py-3'>Action</th></tr></thead><tbody className='divide-y divide-slate-100'>{permissions.map((p) => { const edit = permissionEdits[p.user_id] || {}; const canEditTarget = role === 'OWNER' || p.role !== 'OWNER'; const canEditTargetRole = role === 'OWNER' || !['OWNER', 'ADMIN'].includes(p.role); const targetRoleOptions = role === 'OWNER' ? permissionRoles : [...new Set([p.role, ...permissionRoles])]; return <tr key={p.user_id}><td className='px-3 py-3 font-mono text-xs'>{p.user_id}</td><td className='px-3 py-3'><select disabled={!canEditTargetRole} className='min-h-10 rounded-lg border border-slate-200 px-2 disabled:bg-slate-100 disabled:text-slate-500' value={edit.role || p.role} onChange={(e) => setPermissionEdits((prev) => ({ ...prev, [p.user_id]: { ...(prev[p.user_id] || {}), role: e.target.value } }))}>{targetRoleOptions.map((item) => <option key={item}>{item}</option>)}</select></td><td className='px-3 py-3'><select disabled={!canEditTarget} className='min-h-10 rounded-lg border border-slate-200 px-2 disabled:bg-slate-100 disabled:text-slate-500' value={edit.status || p.status} onChange={(e) => setPermissionEdits((prev) => ({ ...prev, [p.user_id]: { ...(prev[p.user_id] || {}), status: e.target.value } }))}>{['ACTIVE','SUSPENDED','REMOVED','INVITED'].map((status) => <option key={status}>{status}</option>)}</select></td><td className='px-3 py-3'><button type='button' disabled={saving || !canEditTarget || !Object.keys(edit).length} onClick={() => savePermission(p.user_id)} className='rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40'>Save</button></td></tr>; })}</tbody></table></div>{permissions.length === 0 && <p className='mt-4 text-sm text-slate-500'>No workspace memberships found, or your role cannot manage them.</p>}</section>}
        {tab === 'import' && <form onSubmit={importCsv} className='mt-5 max-w-3xl rounded-2xl border border-slate-200 bg-white p-5'><h2 className='font-semibold'>Import members from CSV</h2><p className='mt-1 text-sm leading-6 text-slate-500'>Use a header row with <code>full_name</code> and optional <code>email</code>, <code>phone</code>. Up to 1,000 rows per import. Validation is performed before writing.</p><label className='mt-4 block'><span className='mb-1.5 block text-sm font-medium'>CSV content</span><textarea required rows={10} maxLength={2000000} className={inputClass + ' font-mono'} value={csv} onChange={(e) => setCsv(e.target.value)} /></label><button disabled={saving} className={'mt-4 ' + buttonClass}>Validate and import</button></form>}
      </>}
      <p className='mt-8 text-xs leading-5 text-slate-400'>Workspace access is validated by the server for every API request. Configure MongoDB Atlas and Supabase environment secrets before using real data.</p>
    </div>
  </main>;
}
