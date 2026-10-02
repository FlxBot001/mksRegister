import { NextResponse } from 'next/server';
import { canManageMembers, getTenantMembership } from '@/lib/auth/tenant';
import { getAuthContext, supabaseFetch } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function requestedTenant(request, body) {
  return request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id') || body?.tenant_id || '';
}

export async function GET(request) {
  const context = await getAuthContext();
  if (!context.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: context.error || 'Please sign in.' } }, { status: 401 });
  const tenantId = requestedTenant(request);
  if (!await getTenantMembership(context.accessToken, context.user.id, tenantId)) {
    return NextResponse.json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'You do not have access to this workspace.' } }, { status: 403 });
  }
  const query = new URLSearchParams({ select: 'id,full_name,email,phone,membership_status,created_at', tenant_id: `eq.${tenantId}`, deleted_at: 'is.null', order: 'created_at.desc', limit: '100' });
  const result = await supabaseFetch(`/rest/v1/members?${query.toString()}`, context.accessToken);
  if (!result.ok) return NextResponse.json({ success: false, error: { code: 'MEMBERS_LOOKUP_FAILED', message: 'Could not load member records.' } }, { status: result.status || 500 });
  return NextResponse.json({ success: true, data: Array.isArray(result.data) ? result.data : [], message: 'Members loaded.' });
}

export async function POST(request) {
  const context = await getAuthContext();
  if (!context.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: context.error || 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ success: false, error: { code: 'INVALID_BODY', message: 'Request body must be a JSON object.' } }, { status: 400 });
  const tenantId = requestedTenant(request, body);
  if (!await canManageMembers(context.accessToken, context.user.id, tenantId)) {
    return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your workspace role does not allow you to add members.' } }, { status: 403 });
  }
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  if (fullName.length < 2 || fullName.length > 160) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'A member name between 2 and 160 characters is required.' } }, { status: 400 });
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email address.' } }, { status: 400 });
  if (phone && phone.length > 40) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Phone number must be 40 characters or fewer.' } }, { status: 400 });

  const result = await supabaseFetch('/rest/v1/members', context.accessToken, {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ tenant_id: tenantId, full_name: fullName, email, phone, membership_status: 'ACTIVE', created_by: context.user.id }),
  });
  if (!result.ok) {
    const duplicate = result.status === 409 || result.data?.code === '23505';
    return NextResponse.json({ success: false, error: { code: duplicate ? 'DUPLICATE_MEMBER' : 'MEMBER_CREATE_FAILED', message: duplicate ? 'A record with that unique contact value already exists in this workspace.' : 'The member record could not be saved.' } }, { status: duplicate ? 409 : result.status || 500 });
  }
  return NextResponse.json({ success: true, data: Array.isArray(result.data) ? result.data[0] : result.data, message: 'Member created.' }, { status: 201 });
}
