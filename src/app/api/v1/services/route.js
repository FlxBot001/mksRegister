import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/auth/server';
import { getTenantMembership } from '@/lib/auth/tenant';
import { roleHasPermission } from '@/lib/auth/role-policy.mjs';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';

function tenantId(request, body) {
  return request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id') || body?.tenant_id || '';
}
function fail(error) {
  const issue = mongoUnavailable(error);
  return NextResponse.json({ success: false, error: { code: issue.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: issue.message } }, { status: issue.status });
}

export async function GET(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  const tenant = tenantId(request);
  if (!await getTenantMembership(auth.accessToken, auth.user.id, tenant)) return NextResponse.json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Workspace access denied.' } }, { status: 403 });
  try {
    const db = await getDatabase();
    const items = await db.collection('services').find({ tenant_id: tenant, deleted_at: null }).sort({ created_at: -1 }).limit(200).toArray();
    return NextResponse.json({ success: true, data: items.map(({ _id, name, description, active, created_at }) => ({ id: _id.toString(), name, description, active, created_at })) });
  } catch (error) { return fail(error); }
}

export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  const tenant = tenantId(request, body);
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!roleHasPermission(membership?.role, 'services.manage')) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot manage services.' } }, { status: 403 });
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  if (name.length < 2 || name.length > 120 || description.length > 1000) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Service name must be 2–120 characters; description must be at most 1000 characters.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const now = new Date();
    const doc = { tenant_id: tenant, name, name_normalized: name.toLocaleLowerCase(), description, active: true, created_by: auth.user.id, created_at: now, updated_at: now, deleted_at: null };
    const result = await db.collection('services').insertOne(doc);
    await db.collection('audit_logs').insertOne({ tenant_id: tenant, actor_id: auth.user.id, action: 'service.created', entity_type: 'service', entity_id: result.insertedId.toString(), created_at: now });
    return NextResponse.json({ success: true, data: { id: result.insertedId.toString(), name, description, active: true, created_at: now } }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: { code: 'DUPLICATE_SERVICE', message: 'A service with that name already exists in this workspace.' } }, { status: 409 });
    return fail(error);
  }
}
