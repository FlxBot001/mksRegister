import { supabaseFetch } from '@/lib/supabase/server';
import { roleHasPermission } from '@/lib/auth/role-policy.mjs';

export async function getTenantMembership(accessToken, userId, tenantId) {
  if (!tenantId || !userId) return null;
  const query = new URLSearchParams({ select: 'tenant_id,user_id,role,status', tenant_id: `eq.${tenantId}`, user_id: `eq.${userId}`, status: 'eq.ACTIVE', limit: '1' });
  const result = await supabaseFetch(`/rest/v1/tenant_memberships?${query.toString()}`, accessToken);
  if (!result.ok || !Array.isArray(result.data)) return null;
  return result.data[0] || null;
}

export function canReadMembers(membership) {
  return roleHasPermission(membership?.role, 'members.read');
}

export function canReadAttendance(membership) {
  return roleHasPermission(membership?.role, 'attendance.read');
}

export function canRecordAttendance(membership) {
  return roleHasPermission(membership?.role, 'attendance.create');
}

export function canReadReports(membership) {
  return roleHasPermission(membership?.role, 'reports.read');
}

export async function canManageMembers(accessToken, userId, tenantId) {
  const membership = await getTenantMembership(accessToken, userId, tenantId);
  return membership && roleHasPermission(membership.role, 'members.create') ? membership : null;
}
