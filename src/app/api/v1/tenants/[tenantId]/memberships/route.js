import { NextResponse } from 'next/server';
import { getAuthContext, supabaseFetch } from '@/lib/supabase/server';
import { getTenantMembership } from '@/lib/auth/tenant';

export const dynamic = 'force-dynamic';
const ASSIGNABLE_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'REPORT_VIEWER', 'VOLUNTEER', 'MEMBER']);
const STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'REMOVED', 'INVITED']);
const fail = (code, message, status) => NextResponse.json({ success: false, error: { code, message } }, { status });

async function authorize(request, tenantId) {
  const auth = await getAuthContext();
  if (!auth.user) return { response: fail('UNAUTHENTICATED', 'Please sign in.', 401) };
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenantId);
  if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) return { response: fail('PERMISSION_DENIED', 'Only workspace owners and administrators can manage permissions.', 403) };
  return { auth, membership, tenantId };
}

export async function GET(request, { params }) {
  const { tenantId } = await params;
  const access = await authorize(request, tenantId);
  if (access.response) return access.response;
  const query = new URLSearchParams({ select: 'tenant_id,user_id,role,status,created_at,updated_at', tenant_id: 'eq.' + tenantId, order: 'created_at.asc', limit: '500' });
  const result = await supabaseFetch('/rest/v1/tenant_memberships?' + query, access.auth.accessToken);
  if (!result.ok) return fail('MEMBERSHIP_LOOKUP_FAILED', 'Could not load workspace permissions.', result.status || 500);
  return NextResponse.json({ success: true, data: Array.isArray(result.data) ? result.data : [] });
}

export async function PATCH(request, { params }) {
  const { tenantId } = await params;
  const access = await authorize(request, tenantId);
  if (access.response) return access.response;
  let body;
  try { body = await request.json(); } catch { return fail('INVALID_JSON', 'Send valid JSON.', 400); }
  if (typeof body?.user_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.user_id)) return fail('VALIDATION_ERROR', 'A valid user_id is required.', 400);
  if (body.role !== undefined && !ASSIGNABLE_ROLES.has(body.role)) return fail('VALIDATION_ERROR', 'Select a valid workspace role.', 400);
  if (body.status !== undefined && !STATUSES.has(body.status)) return fail('VALIDATION_ERROR', 'Select a valid membership status.', 400);
  if (body.role === undefined && body.status === undefined) return fail('VALIDATION_ERROR', 'Provide a role or status to update.', 400);
  if (access.membership.role !== 'OWNER' && (body.role === 'OWNER' || body.role === 'ADMIN')) return fail('PERMISSION_DENIED', 'Only workspace owners can assign owner or administrator roles.', 403);
  if (body.user_id === access.auth.user.id && body.status && body.status !== 'ACTIVE') return fail('SELF_LOCKOUT_BLOCKED', 'You cannot suspend or remove your own active membership here.', 409);
  const query = new URLSearchParams({ select: 'user_id,role,status', tenant_id: 'eq.' + tenantId, user_id: 'eq.' + body.user_id, limit: '1' });
  const current = await supabaseFetch('/rest/v1/tenant_memberships?' + query, access.auth.accessToken);
  if (!current.ok) return fail('MEMBERSHIP_LOOKUP_FAILED', 'Could not load the target membership.', current.status || 500);
  const target = Array.isArray(current.data) ? current.data[0] : null;
  if (!target) return fail('MEMBERSHIP_NOT_FOUND', 'That user is not a member of this workspace.', 404);
  if (target.role === 'OWNER' && (body.role && body.role !== 'OWNER' || body.status && body.status !== 'ACTIVE')) {
    const ownersQuery = new URLSearchParams({ select: 'user_id', tenant_id: 'eq.' + tenantId, role: 'eq.OWNER', status: 'eq.ACTIVE' });
    const owners = await supabaseFetch('/rest/v1/tenant_memberships?' + ownersQuery, access.auth.accessToken);
    if (!owners.ok) return fail('OWNER_CHECK_FAILED', 'Could not verify active workspace owners.', owners.status || 500);
    if (Array.isArray(owners.data) && owners.data.length <= 1) return fail('LAST_OWNER_PROTECTED', 'A workspace must keep at least one active owner.', 409);
    if (access.membership.role !== 'OWNER') return fail('PERMISSION_DENIED', 'Only an owner can change another owner.', 403);
  }
  const update = {};
  if (body.role !== undefined) update.role = body.role;
  if (body.status !== undefined) update.status = body.status;
  update.updated_at = new Date().toISOString();
  const updateQuery = new URLSearchParams({ tenant_id: 'eq.' + tenantId, user_id: 'eq.' + body.user_id });
  const saved = await supabaseFetch('/rest/v1/tenant_memberships?' + updateQuery.toString(), access.auth.accessToken, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(update),
  });
  if (!saved.ok) return fail('MEMBERSHIP_UPDATE_FAILED', 'Could not update this workspace membership.', saved.status || 500);
  return NextResponse.json({ success: true, data: Array.isArray(saved.data) ? saved.data[0] : saved.data, message: 'Workspace permissions updated.' });
}
