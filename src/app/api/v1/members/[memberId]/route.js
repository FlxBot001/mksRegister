import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/supabase/server';
import { canManageMembers, getTenantMembership } from '@/lib/auth/tenant';
import { getDatabase, isValidObjectId, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';

async function authorize(request, body) {
  const auth = await getAuthContext();
  if (!auth.user) return { response: NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 }) };
  const tenant = request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id') || body?.tenant_id || '';
  const membership = await canManageMembers(auth.accessToken, auth.user.id, tenant);
  if (!membership) return { response: NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot manage members.' } }, { status: 403 }) };
  return { auth, tenant, membership };
}
function fail(error) { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: e.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: e.message } }, { status: e.status }); }

export async function PATCH(request, { params }) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  const access = await authorize(request, body);
  if (access.response) return access.response;
  const { memberId } = await params;
  if (!isValidObjectId(memberId)) return NextResponse.json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid member ID.' } }, { status: 400 });
  const update = { updated_at: new Date() };
  if (body.full_name !== undefined) {
    if (typeof body.full_name !== 'string' || body.full_name.trim().length < 2 || body.full_name.trim().length > 160) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name must be 2–160 characters.' } }, { status: 400 });
    update.full_name = body.full_name.trim().replace(/\s+/g, ' ');
  }
  if (body.email !== undefined) {
    if (body.email !== null && (typeof body.email !== 'string' || (body.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())))) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email or null.' } }, { status: 400 });
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email.length > 254) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email is too long.' } }, { status: 400 });
    update.email = email || null; update.email_normalized = email || undefined;
  }
  if (body.phone !== undefined) {
    if (body.phone !== null && (typeof body.phone !== 'string' || body.phone.trim().length > 40)) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Phone must be at most 40 characters.' } }, { status: 400 });
    update.phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  }
  if (body.membership_status !== undefined) {
    if (!['ACTIVE', 'INACTIVE', 'VISITOR', 'PENDING', 'DEPARTED'].includes(body.membership_status)) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid membership status.' } }, { status: 400 });
    update.membership_status = body.membership_status;
  }
  try {
    const db = await getDatabase();
    const result = await db.collection('members').findOneAndUpdate({ _id: new ObjectId(memberId), tenant_id: access.tenant, deleted_at: null }, { $set: update }, { returnDocument: 'after' });
    if (!result) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found in this workspace.' } }, { status: 404 });
    await db.collection('audit_logs').insertOne({ tenant_id: access.tenant, actor_id: access.auth.user.id, action: 'member.updated', entity_type: 'member', entity_id: memberId, created_at: new Date() });
    return NextResponse.json({ success: true, data: { id: result._id.toString(), full_name: result.full_name, email: result.email || null, phone: result.phone || null, membership_status: result.membership_status, updated_at: result.updated_at } });
  } catch (error) { if (error?.code === 11000) return NextResponse.json({ success: false, error: { code: 'DUPLICATE_MEMBER', message: 'That email already exists in this workspace.' } }, { status: 409 }); return fail(error); }
}

export async function DELETE(request, { params }) {
  const access = await authorize(request, null);
  if (access.response) return access.response;
  if (!['OWNER', 'ADMIN'].includes(access.membership.role)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Only owners and administrators can archive members.' } }, { status: 403 });
  const { memberId } = await params;
  if (!isValidObjectId(memberId)) return NextResponse.json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid member ID.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const result = await db.collection('members').updateOne({ _id: new ObjectId(memberId), tenant_id: access.tenant, deleted_at: null }, { $set: { deleted_at: new Date(), updated_at: new Date(), membership_status: 'INACTIVE' } });
    if (!result.matchedCount) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Member not found in this workspace.' } }, { status: 404 });
    await db.collection('audit_logs').insertOne({ tenant_id: access.tenant, actor_id: access.auth.user.id, action: 'member.archived', entity_type: 'member', entity_id: memberId, created_at: new Date() });
    return NextResponse.json({ success: true, message: 'Member archived.' });
  } catch (error) { return fail(error); }
}
