import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/server';
import { canManageMembers, canReadMembers, getTenantMembership } from '@/lib/auth/tenant';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
function tenantId(request, body) { return request.headers.get('x-tenant-id') || new URL(request.url).searchParams.get('tenant_id') || body?.tenant_id || ''; }
function fail(error) { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: e.status === 503 ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_ERROR', message: e.message } }, { status: e.status }); }

export async function GET(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  const tenant = tenantId(request);
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!membership) return NextResponse.json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Workspace access denied.' } }, { status: 403 });
  if (!canReadMembers(membership)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot view the member directory.' } }, { status: 403 });
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 200);
  const search = (url.searchParams.get('q') || '').trim().slice(0, 100);
  try {
    const db = await getDatabase();
    const filter = { tenant_id: tenant, deleted_at: null };
    if (search) filter.$or = [{ full_name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { email_normalized: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
    const records = await db.collection('members').find(filter).sort({ created_at: -1 }).limit(limit).toArray();
    return NextResponse.json({ success: true, data: records.map((m) => ({ id: m._id.toString(), full_name: m.full_name, email: m.email || null, phone: m.phone || null, membership_status: m.membership_status || 'ACTIVE', created_at: m.created_at })) });
  } catch (error) { return fail(error); }
}

export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ success: false, error: { code: 'INVALID_BODY', message: 'Request body must be an object.' } }, { status: 400 });
  const tenant = tenantId(request, body);
  if (!await canManageMembers(auth.accessToken, auth.user.id, tenant)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your workspace role cannot add members.' } }, { status: 403 });
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : '';
  if (full_name.length < 2 || full_name.length > 160) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Name must be 2–160 characters.' } }, { status: 400 });
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email.' } }, { status: 400 });
  if (phone.length > 40) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Phone must be at most 40 characters.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const now = new Date();
    const doc = { tenant_id: tenant, full_name, email: email || null, email_normalized: email || undefined, phone: phone || null, membership_status: 'ACTIVE', created_by: auth.user.id, created_at: now, updated_at: now, deleted_at: null };
    const result = await db.collection('members').insertOne(doc);
    await db.collection('audit_logs').insertOne({ tenant_id: tenant, actor_id: auth.user.id, action: 'member.created', entity_type: 'member', entity_id: result.insertedId.toString(), created_at: now });
    return NextResponse.json({ success: true, data: { id: result.insertedId.toString(), full_name, email: email || null, phone: phone || null, membership_status: 'ACTIVE', created_at: now } }, { status: 201 });
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: { code: 'DUPLICATE_MEMBER', message: 'That email already exists in this workspace.' } }, { status: 409 });
    return fail(error);
  }
}
