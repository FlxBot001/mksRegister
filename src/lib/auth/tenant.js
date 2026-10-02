import { supabaseFetch } from '@/lib/supabase/server';

const MEMBER_WRITE_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER', 'REGISTRAR']);

export async function getTenantMembership(accessToken, userId, tenantId) {
  if (!tenantId || !userId) return null;
  const query = new URLSearchParams({ select: 'tenant_id,user_id,role,status', tenant_id: `eq.${tenantId}`, user_id: `eq.${userId}`, status: 'eq.ACTIVE', limit: '1' });
  const result = await supabaseFetch(`/rest/v1/tenant_memberships?${query.toString()}`, accessToken);
  if (!result.ok || !Array.isArray(result.data)) return null;
  return result.data[0] || null;
}

export async function canManageMembers(accessToken, userId, tenantId) {
  const membership = await getTenantMembership(accessToken, userId, tenantId);
  return membership && MEMBER_WRITE_ROLES.has(membership.role) ? membership : null;
}
