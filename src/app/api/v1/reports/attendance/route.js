import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/server';
import { canReadReports, getTenantMembership } from '@/lib/auth/tenant';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  const url = new URL(request.url);
  const tenant = request.headers.get('x-tenant-id') || url.searchParams.get('tenant_id') || '';
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!membership) return NextResponse.json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Workspace access denied.' } }, { status: 403 });
  if (!canReadReports(membership)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot view attendance reports.' } }, { status: 403 });
  const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')) : new Date();
  const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')) : new Date(to.getTime() - 30 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return NextResponse.json({ success: false, error: { code: 'INVALID_DATE_RANGE', message: 'Provide a valid date range with from before to.' } }, { status: 400 });
  if (to.getTime() - from.getTime() > 366 * 86400000) return NextResponse.json({ success: false, error: { code: 'DATE_RANGE_TOO_LARGE', message: 'Report ranges cannot exceed 366 days.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const match = { tenant_id: tenant, recorded_at: { $gte: from, $lte: to } };
    const [totals, byService, byDay, activeMembers, activeServices] = await Promise.all([
      db.collection('attendance').aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      db.collection('attendance').aggregate([{ $match: match }, { $group: { _id: '$service_id', service_name: { $first: '$service_name' }, count: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } } } }, { $sort: { count: -1 } }, { $limit: 100 }]).toArray(),
      db.collection('attendance').aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$recorded_at' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 366 }]).toArray(),
      db.collection('members').countDocuments({ tenant_id: tenant, deleted_at: null, membership_status: { $ne: 'INACTIVE' } }),
      db.collection('services').countDocuments({ tenant_id: tenant, deleted_at: null, active: true }),
    ]);
    const counts = Object.fromEntries(totals.map((x) => [x._id, x.count]));
    const total = totals.reduce((sum, x) => sum + x.count, 0);
    return NextResponse.json({ success: true, data: { period: { from, to }, totals: { total, present: counts.PRESENT || 0, late: counts.LATE || 0, absent: counts.ABSENT || 0, excused: counts.EXCUSED || 0, attendance_rate: total ? Math.round(((counts.PRESENT || 0) + (counts.LATE || 0)) / total * 1000) / 10 : 0 }, active_members: activeMembers, active_services: activeServices, by_service: byService.map((x) => ({ service_id: x._id.toString(), service_name: x.service_name, total: x.count, present: x.present })), by_day: byDay.map((x) => ({ date: x._id, count: x.count })) } });
  } catch (error) {
    const issue = mongoUnavailable(error);
    return NextResponse.json({ success: false, error: { code: issue.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: issue.message } }, { status: issue.status });
  }
}
