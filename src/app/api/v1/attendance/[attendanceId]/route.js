import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/auth/server';
import { canRecordAttendance, getTenantMembership } from '@/lib/auth/tenant';
import { getDatabase, isValidObjectId, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
const fail = (error) => { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: e.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: e.message } }, { status: e.status }); };

export async function PATCH(request, { params }) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  const tenant = request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id') || body?.tenant_id || '';
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!canRecordAttendance(membership)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot correct attendance records.' } }, { status: 403 });
  const { attendanceId } = await params;
  if (!isValidObjectId(attendanceId)) return NextResponse.json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid attendance ID.' } }, { status: 400 });
  const update = { updated_at: new Date(), updated_by: auth.user.id };
  if (body.status !== undefined) {
    if (!['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'].includes(body.status)) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid attendance status.' } }, { status: 400 });
    update.status = body.status;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.trim().length > 1000) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Notes must be a string of at most 1000 characters.' } }, { status: 400 });
    update.notes = body.notes.trim();
  }
  if (body.recorded_at !== undefined) {
    const date = new Date(body.recorded_at);
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 5 * 60 * 1000) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid non-future attendance date.' } }, { status: 400 });
    update.recorded_at = date;
  }
  if (Object.keys(update).length === 2) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a status, notes, or recorded_at change.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const collection = db.collection('attendance');
    const before = await collection.findOne({ _id: new ObjectId(attendanceId), tenant_id: tenant });
    if (!before) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Attendance record not found in this workspace.' } }, { status: 404 });
    const saved = await collection.findOneAndUpdate({ _id: before._id, tenant_id: tenant }, { $set: update }, { returnDocument: 'after' });
    await db.collection('audit_logs').insertOne({ tenant_id: tenant, actor_id: auth.user.id, action: 'attendance.corrected', entity_type: 'attendance', entity_id: attendanceId, details: { before: { status: before.status, notes: before.notes, recorded_at: before.recorded_at }, after: { status: saved.status, notes: saved.notes, recorded_at: saved.recorded_at } }, created_at: new Date() });
    return NextResponse.json({ success: true, data: { id: saved._id.toString(), member_id: saved.member_id.toString(), member_name: saved.member_name, service_id: saved.service_id.toString(), service_name: saved.service_name, status: saved.status, notes: saved.notes, recorded_at: saved.recorded_at, updated_at: saved.updated_at } });
  } catch (error) { return fail(error); }
}
