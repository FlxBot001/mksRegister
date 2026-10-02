import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/supabase/server';
import { canReadAttendance, getTenantMembership } from '@/lib/auth/tenant';
import { getDatabase, isValidObjectId, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  const url = new URL(request.url);
  const tenant = request.headers.get('x-tenant-id') || url.searchParams.get('tenant_id') || '';
  const memberId = url.searchParams.get('member_id');
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!tenant || !membership) return NextResponse.json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Workspace access denied.' } }, { status: 403 });
  if (!canReadAttendance(membership)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot view individual attendance history.' } }, { status: 403 });
  if (!isValidObjectId(memberId)) return NextResponse.json({ success: false, error: { code: 'INVALID_MEMBER_ID', message: 'A valid member_id is required.' } }, { status: 400 });
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
  try {
    const db = await getDatabase();
    const member = await db.collection('members').findOne({ _id: new ObjectId(memberId), tenant_id: tenant, deleted_at: null }, { projection: { full_name: 1 } });
    if (!member) return NextResponse.json({ success: false, error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found in this workspace.' } }, { status: 404 });
    const records = await db.collection('attendance').find({ tenant_id: tenant, member_id: member._id }).sort({ recorded_at: -1 }).limit(limit).toArray();
    return NextResponse.json({ success: true, data: { member: { id: member._id.toString(), full_name: member.full_name }, records: records.map((r) => ({ id: r._id.toString(), service_id: r.service_id.toString(), service_name: r.service_name, status: r.status, notes: r.notes, recorded_at: r.recorded_at, recorded_by: r.recorded_by })) } });
  } catch (error) {
    const configured = String(error?.message || '').includes('not configured');
    return NextResponse.json({ success: false, error: { code: configured ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: configured ? 'The application database is not configured.' : 'Could not load attendance history.' } }, { status: configured ? 503 : 500 });
  }
}
