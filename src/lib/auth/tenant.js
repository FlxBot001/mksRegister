import { supabaseFetch } from '@/lib/supabase/server';

const MEMBER_READ_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'COMMUNICATIONS']);
const MEMBER_WRITE_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'REGISTRAR']);
const ATTENDANCE_READ_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'REPORT_VIEWER']);
const ATTENDANCE_WRITE_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'REGISTRAR', 'ATTENDANCE_OFFICER']);
const REPORT_READ_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'REPORT_VIEWER']);

export async function getTenantMembership(accessToken, userId, tenantId) {
  if (!tenantId || !userId) return null;
  const query = new URLSearchParams({ select: 'tenant_id,user_id,role,status', tenant_id: `eq.${tenantId}`, user_id: `eq.${userId}`, status: 'eq.ACTIVE', limit: '1' });
  const result = await supabaseFetch(`/rest/v1/tenant_memberships?${query.toString()}`, accessToken);
  if (!result.ok || !Array.isArray(result.data)) return null;
  return result.data[0] || null;
}

export function canReadMembers(membership) {
  return Boolean(membership && MEMBER_READ_ROLES.has(membership.role));
}

export function canReadAttendance(membership) {
  return Boolean(membership && ATTENDANCE_READ_ROLES.has(membership.role));
}

export function canRecordAttendance(membership) {
  return Boolean(membership && ATTENDANCE_WRITE_ROLES.has(membership.role));
}

export function canReadReports(membership) {
  return Boolean(membership && REPORT_READ_ROLES.has(membership.role));
}

export async function canManageMembers(accessToken, userId, tenantId) {
  const membership = await getTenantMembership(accessToken, userId, tenantId);
  return membership && MEMBER_WRITE_ROLES.has(membership.role) ? membership : null;
}
