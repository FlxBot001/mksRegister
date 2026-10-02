import { NextResponse } from 'next/server';
import { getAuthContext, supabaseFetch } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getAuthContext();
  if (!context.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: context.error || 'Please sign in.' } }, { status: 401 });
  const query = new URLSearchParams({ select: 'tenant_id,role,status,tenants(id,name,slug,created_at)', user_id: `eq.${context.user.id}`, status: 'eq.ACTIVE', order: 'created_at.asc' });
  const result = await supabaseFetch(`/rest/v1/tenant_memberships?${query.toString()}`, context.accessToken);
  if (!result.ok) return NextResponse.json({ success: false, error: { code: 'TENANT_LOOKUP_FAILED', message: 'Could not load your workspaces.' } }, { status: result.status || 500 });
  const tenants = (Array.isArray(result.data) ? result.data : []).filter((row) => row.tenants && row.status === 'ACTIVE').map((row) => ({ ...row.tenants, role: row.role }));
  return NextResponse.json({ success: true, data: tenants, message: 'Workspaces loaded.' });
}

export async function POST(request) {
  const context = await getAuthContext();
  if (!context.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: context.error || 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (name.length < 2 || name.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 70) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a workspace name and a URL-friendly slug.' } }, { status: 400 });
  }
  const result = await supabaseFetch('/rest/v1/rpc/create_tenant_for_current_user', context.accessToken, { method: 'POST', body: JSON.stringify({ p_name: name, p_slug: slug }) });
  if (!result.ok) {
    const conflict = result.status === 409 || result.data?.code === '23505';
    return NextResponse.json({ success: false, error: { code: conflict ? 'TENANT_SLUG_EXISTS' : 'TENANT_CREATE_FAILED', message: conflict ? 'That workspace URL is already in use. Choose another.' : 'Could not create the workspace. Check database setup and try again.' } }, { status: conflict ? 409 : result.status || 500 });
  }
  return NextResponse.json({ success: true, data: result.data, message: 'Workspace created.' }, { status: 201 });
}
