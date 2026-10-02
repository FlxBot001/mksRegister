import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/supabase/server';
import { getTenantMembership } from '@/lib/auth/tenant';
import { getDatabase, isValidObjectId, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
const RECORD_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR']);
const fail = (error) => { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: e.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: e.message } }, { status: e.status }); };
function tenantId(request, body) { return request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id') || body?.tenant_id || ''; }

export async function GET(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  const url = new URL(request.url);
  const tenant = tenantId(request);
  if (!await getTenantMembership(auth.accessToken, auth.user.id, tenant)) return NextResponse.json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Workspace access denied.' } }, { status: 403 });
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  try {
    const db = await getDatabase();
    const filter = { tenant_id: tenant };
    if (url.searchParams.get('member_id')) {
      if (!isValidObjectId(url.searchParams.get('member_id'))) return NextResponse.json({ success: false, error: { code: 'INVALID_MEMBER_ID', message: 'Invalid member ID.' } }, { status: 400 });
      filter.member_id = new ObjectId(url.searchParams.get('member_id'));
    }
    if (url.searchParams.get('service_id')) {
      if (!isValidObjectId(url.searchParams.get('service_id'))) return NextResponse.json({ success: false, error: { code: 'INVALID_SERVICE_ID', message: 'Invalid service ID.' } }, { status: 400 });
      filter.service_id = new ObjectId(url.searchParams.get('service_id'));
    }
    const records = await db.collection('attendance').find(filter).sort({ recorded_at: -1 }).limit(limit).toArray();
    return NextResponse.json({ success: true, data: records.map((r) => ({ id: r._id.toString(), member_id: r.member_id.toString(), member_name: r.member_name, service_id: r.service_id.toString(), service_name: r.service_name, status: r.status, notes: r.notes, recorded_at: r.recorded_at, recorded_by: r.recorded_by })) });
  } catch (error) { return fail(error); }
}

export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  const tenant = tenantId(request, body);
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!membership || !RECORD_ROLES.has(membership.role)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot record attendance.' } }, { status: 403 });
  if (!isValidObjectId(body?.member_id) || !isValidObjectId(body?.service_id)) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid member_id and service_id are required.' } }, { status: 400 });
  const status = body.status || 'PRESENT';
  if (!['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(status)) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Status must be PRESENT, ABSENT, LATE, or EXCUSED.' } }, { status: 400 });
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (notes.length > 1000) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Notes must be at most 1000 characters.' } }, { status: 400 });
  const recordedAt = body.recorded_at ? new Date(body.recorded_at) : new Date();
  if (Number.isNaN(recordedAt.getTime()) || recordedAt.getTime() > Date.now() + 5 * 60 * 1000) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid attendance date that is not in the future.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const [member, service] = await Promise.all([
      db.collection('members').findOne({ _id: new ObjectId(body.member_id), tenant_id: tenant, deleted_at: null }),
      db.collection('services').findOne({ _id: new ObjectId(body.service_id), tenant_id: tenant, deleted_at: null, active: true }),
    ]);
    if (!member) return NextResponse.json({ success: false, error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found in this workspace.' } }, { status: 404 });
    if (!service) return NextResponse.json({ success: false, error: { code: 'SERVICE_NOT_FOUND', message: 'Active service not found in this workspace.' } }, { status: 404 });
    const now = new Date();
    const record = { tenant_id: tenant, member_id: member._id, member_name: member.full_name, service_id: service._id, service_name: service.name, status, notes, recorded_at: recordedAt, recorded_by: auth.user.id, created_at: now, updated_at: now };
    const result = await db.collection('attendance').insertOne(record);
    await db.collection('audit_logs').insertOne({ tenant_id: tenant, actor_id: auth.user.id, action: 'attendance.recorded', entity_type: 'attendance', entity_id: result.insertedId.toString(), created_at: now });
    return NextResponse.json({ success: true, data: { id: result.insertedId.toString(), member_id: member._id.toString(), member_name: member.full_name, service_id: service._id.toString(), service_name: service.name, status, notes, recorded_at: recordedAt } }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: { code: 'ATTENDANCE_ALREADY_RECORDED', message: 'Attendance has already been recorded for this member and service.' } }, { status: 409 });
    return fail(error);
  }
}
