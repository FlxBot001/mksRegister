import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/auth/server';
import { getTenantMembership } from '@/lib/auth/tenant';
import { roleHasPermission, ROLE_NAMES } from '@/lib/auth/role-policy.mjs';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
const ASSIGNABLE_ROLES = new Set(ROLE_NAMES);
const STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'REMOVED']);
const fail = (code, message, status) => NextResponse.json({ success: false, error: { code, message } }, { status });
async function authorize(tenantId) {
  const auth = await getAuthContext();
  if (!auth.user) return { response: fail('UNAUTHENTICATED', auth.error || 'Please sign in.', 401) };
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenantId);
  if (!membership || !roleHasPermission(membership.role, 'roles.manage')) return { response: fail('PERMISSION_DENIED', 'Only workspace owners and administrators can manage permissions.', 403) };
  return { auth, membership, tenantId };
}

export async function GET(_request, { params }) {
  const { tenantId } = await params;
  if (!ObjectId.isValid(tenantId)) return fail('INVALID_TENANT', 'Workspace ID is invalid.', 400);
  const access = await authorize(tenantId);
  if (access.response) return access.response;
  try {
    const db = await getDatabase();
    const items = await db.collection('memberships').aggregate([
      { $match: { tenant_id: tenantId } },
      { $sort: { created_at: 1 } },
      { $limit: 500 },
      { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'account' } },
      { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 0, tenant_id: 1, user_id: { $toString: '$user_id' }, role: 1, status: 1, created_at: 1, updated_at: 1, email: '$account.email', full_name: '$account.full_name' } },
    ]).toArray();
    return NextResponse.json({ success: true, data: items });
  } catch (error) { const e = mongoUnavailable(error); return fail('MEMBERSHIP_LOOKUP_FAILED', e.message, e.status); }
}

export async function PATCH(request, { params }) {
  const { tenantId } = await params;
  if (!ObjectId.isValid(tenantId)) return fail('INVALID_TENANT', 'Workspace ID is invalid.', 400);
  const access = await authorize(tenantId);
  if (access.response) return access.response;
  let body;
  try { body = await request.json(); } catch { return fail('INVALID_JSON', 'Send valid JSON.', 400); }
  if (typeof body?.user_id !== 'string' || !ObjectId.isValid(body.user_id)) return fail('VALIDATION_ERROR', 'A valid user_id is required.', 400);
  if (body.role !== undefined && !ASSIGNABLE_ROLES.has(body.role)) return fail('VALIDATION_ERROR', 'Select a valid workspace role.', 400);
  if (body.status !== undefined && !STATUSES.has(body.status)) return fail('VALIDATION_ERROR', 'Select a valid membership status.', 400);
  if (body.role === undefined && body.status === undefined) return fail('VALIDATION_ERROR', 'Provide a role or status to update.', 400);
  if (body.user_id === access.auth.user.id && body.status && body.status !== 'ACTIVE') return fail('SELF_LOCKOUT_BLOCKED', 'You cannot suspend or remove your own active membership here.', 409);
  if (access.membership.role !== 'OWNER' && (body.role === 'OWNER' || body.role === 'ADMIN' || body.role === 'MANAGEMENT')) return fail('PERMISSION_DENIED', 'Only workspace owners can assign owner, administrator, or management roles.', 403);
  try {
    const db = await getDatabase();
    const targetId = new ObjectId(body.user_id);
    const target = await db.collection('memberships').findOne({ tenant_id: tenantId, user_id: targetId });
    if (!target) return fail('MEMBERSHIP_NOT_FOUND', 'That user is not a member of this workspace.', 404);
    if (access.membership.role !== 'OWNER' && target.role === 'OWNER') return fail('PERMISSION_DENIED', 'Only an owner can change another owner.', 403);
    if (access.membership.role === 'ADMIN' && target.role === 'ADMIN') return fail('PERMISSION_DENIED', 'Administrators cannot change another administrator.', 403);
    if (target.role === 'OWNER' && (body.role && body.role !== 'OWNER' || body.status && body.status !== 'ACTIVE')) {
      const owners = await db.collection('memberships').countDocuments({ tenant_id: tenantId, role: 'OWNER', status: 'ACTIVE' });
      if (owners <= 1) return fail('LAST_OWNER_PROTECTED', 'A workspace must keep at least one active owner.', 409);
    }
    const now = new Date();
    const update = { updated_at: now };
    if (body.role !== undefined) update.role = body.role;
    if (body.status !== undefined) update.status = body.status;
    await db.collection('audit_logs').insertOne({ tenant_id: tenantId, actor_id: access.auth.user.id, action: 'membership.update_requested', entity_type: 'tenant_membership', entity_id: body.user_id, before: { role: target.role, status: target.status }, requested: { role: body.role ?? target.role, status: body.status ?? target.status }, created_at: now });
    const saved = await db.collection('memberships').updateOne({ _id: target._id, tenant_id: tenantId, role: target.role, status: target.status }, { $set: update });
    if (!saved.modifiedCount) return fail('MEMBERSHIP_CONFLICT', 'This membership changed concurrently. Reload and try again.', 409);
    await db.collection('audit_logs').insertOne({ tenant_id: tenantId, actor_id: access.auth.user.id, action: 'membership.updated', entity_type: 'tenant_membership', entity_id: body.user_id, before: { role: target.role, status: target.status }, after: { role: update.role || target.role, status: update.status || target.status }, created_at: new Date() });
    const account = await db.collection('users').findOne({ _id: targetId }, { projection: { email: 1, full_name: 1 } });
    return NextResponse.json({ success: true, data: { tenant_id: tenantId, user_id: body.user_id, email: account?.email || null, full_name: account?.full_name || null, role: update.role || target.role, status: update.status || target.status, updated_at: now }, message: 'Workspace permissions updated.' });
  } catch (error) {
    const e = mongoUnavailable(error);
    return fail('MEMBERSHIP_UPDATE_FAILED', e.message, e.status);
  }
}
