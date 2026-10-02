import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/supabase/server';
import { getTenantMembership } from '@/lib/auth/tenant';
import { roleHasPermission } from '@/lib/auth/role-policy.mjs';
import { getDatabase, isValidObjectId, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
const fail = (error) => { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: e.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: e.message } }, { status: e.status }); };

async function authorize(request, body) {
  const auth = await getAuthContext();
  if (!auth.user) return { response: NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 }) };
  const tenant = request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id') || body?.tenant_id || '';
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!roleHasPermission(membership?.role, 'services.manage')) return { response: NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot manage services.' } }, { status: 403 }) };
  return { auth, tenant };
}

export async function PATCH(request, { params }) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ success: false, error: { code: 'INVALID_BODY', message: 'Request body must be a JSON object.' } }, { status: 400 });
  const access = await authorize(request, body);
  if (access.response) return access.response;
  const { serviceId } = await params;
  if (!isValidObjectId(serviceId)) return NextResponse.json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid service ID.' } }, { status: 400 });
  const update = { updated_at: new Date() };
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 120) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Service name must be 2–120 characters.' } }, { status: 400 });
    update.name = body.name.trim().replace(/\s+/g, ' ');
    update.name_normalized = update.name.toLocaleLowerCase();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim().length > 1000) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Description must be at most 1000 characters.' } }, { status: 400 });
    update.description = body.description.trim();
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Active must be true or false.' } }, { status: 400 });
    update.active = body.active;
  }
  try {
    const db = await getDatabase();
    const result = await db.collection('services').findOneAndUpdate({ _id: new ObjectId(serviceId), tenant_id: access.tenant, deleted_at: null }, { $set: update }, { returnDocument: 'after' });
    if (!result) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found in this workspace.' } }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: result._id.toString(), name: result.name, description: result.description, active: result.active, updated_at: result.updated_at } });
  } catch (error) { if (error?.code === 11000) return NextResponse.json({ success: false, error: { code: 'DUPLICATE_SERVICE', message: 'A service with that name already exists.' } }, { status: 409 }); return fail(error); }
}

export async function DELETE(request, { params }) {
  const access = await authorize(request, null);
  if (access.response) return access.response;
  const { serviceId } = await params;
  if (!isValidObjectId(serviceId)) return NextResponse.json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid service ID.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const result = await db.collection('services').updateOne({ _id: new ObjectId(serviceId), tenant_id: access.tenant, deleted_at: null }, { $set: { deleted_at: new Date(), updated_at: new Date(), active: false } });
    if (!result.matchedCount) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found in this workspace.' } }, { status: 404 });
    await db.collection('audit_logs').insertOne({ tenant_id: access.tenant, actor_id: access.auth.user.id, action: 'service.archived', entity_type: 'service', entity_id: serviceId, created_at: new Date() });
    return NextResponse.json({ success: true, message: 'Service archived.' });
  } catch (error) { return fail(error); }
}
