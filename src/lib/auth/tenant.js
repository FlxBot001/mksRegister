import { ObjectId } from 'mongodb';
import { getDatabase } from '@/lib/mongodb/server';
import { roleHasPermission } from '@/lib/auth/role-policy.mjs';

export async function getTenantMembership(_sessionToken, userId, tenantId) {
  if (!tenantId || !userId || !ObjectId.isValid(userId)) return null;
  try {
    const db = await getDatabase();
    return await db.collection('memberships').findOne({
      tenant_id: String(tenantId),
      user_id: new ObjectId(userId),
      status: 'ACTIVE',
    });
  } catch {
    return null;
  }
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

export async function canManageMembers(sessionToken, userId, tenantId) {
  const membership = await getTenantMembership(sessionToken, userId, tenantId);
  return membership && roleHasPermission(membership.role, 'members.create') ? membership : null;
}
