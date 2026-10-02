import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthContext } from '@/lib/auth/server';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const fail = (error) => { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: e.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: e.message } }, { status: e.status }); };

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: auth.error || 'Please sign in.' } }, { status: 401 });
  try {
    const db = await getDatabase();
    const memberships = await db.collection('memberships').find({ user_id: new ObjectId(auth.user.id), status: 'ACTIVE' }).sort({ created_at: 1 }).limit(100).toArray();
    if (!memberships.length) return NextResponse.json({ success: true, data: [] });
    const tenantIds = memberships.map((item) => item.tenant_id);
    const tenants = await db.collection('tenants').find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) }, status: 'ACTIVE' }).toArray();
    const byId = new Map(tenants.map((tenant) => [tenant._id.toString(), tenant]));
    return NextResponse.json({ success: true, data: memberships.flatMap((membership) => {
      const tenant = byId.get(membership.tenant_id);
      return tenant ? [{ id: tenant._id.toString(), name: tenant.name, slug: tenant.slug, created_at: tenant.created_at, role: membership.role }] : [];
    }) });
  } catch (error) { return fail(error); }
}

export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: auth.error || 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (name.length < 2 || name.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 70) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a workspace name and URL-friendly slug.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const now = new Date();
    const tenant = { _id: new ObjectId(), name, slug, slug_normalized: slug, status: 'ACTIVE', created_by: auth.user.id, created_at: now, updated_at: now };
    await db.collection('tenants').insertOne(tenant);
    try {
      await db.collection('memberships').insertOne({ tenant_id: tenant._id.toString(), user_id: new ObjectId(auth.user.id), role: 'OWNER', status: 'ACTIVE', created_at: now, updated_at: now });
    } catch (error) {
      await db.collection('tenants').deleteOne({ _id: tenant._id });
      throw error;
    }
    await db.collection('audit_logs').insertOne({ tenant_id: tenant._id.toString(), actor_id: auth.user.id, action: 'tenant.created', entity_type: 'tenant', entity_id: tenant._id.toString(), created_at: now });
    return NextResponse.json({ success: true, data: { id: tenant._id.toString(), name, slug, role: 'OWNER', created_at: now }, message: 'Workspace created.' }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: { code: 'TENANT_SLUG_EXISTS', message: 'That workspace URL is already in use. Choose another.' } }, { status: 409 });
    return fail(error);
  }
}
