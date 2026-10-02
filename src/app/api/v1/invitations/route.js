import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { getAuthContext } from '@/lib/supabase/server';
import { getTenantMembership } from '@/lib/auth/tenant';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
const INVITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OWNER']);
const ASSIGNABLE_ROLES = new Set(['ADMIN', 'MANAGER', 'REGISTRAR', 'VIEWER']);

export async function GET(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  const url = new URL(request.url);
  const tenant = request.headers.get('x-tenant-id') || url.searchParams.get('tenant_id') || '';
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!membership || !INVITE_ROLES.has(membership.role)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot view invitations.' } }, { status: 403 });
  try {
    const db = await getDatabase();
    const items = await db.collection('invitations').find({ tenant_id: tenant }).sort({ created_at: -1 }).limit(100).project({ token_hash: 0 }).toArray();
    return NextResponse.json({ success: true, data: items.map((i) => ({ id: i._id.toString(), email: i.email, role: i.role, status: i.status, expires_at: i.expires_at, created_at: i.created_at })) });
  } catch (error) { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: 'DATABASE_ERROR', message: e.message } }, { status: e.status }); }
}

export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Please sign in.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  const tenant = request.headers.get('x-tenant-id') || body?.tenant_id || '';
  const membership = await getTenantMembership(auth.accessToken, auth.user.id, tenant);
  if (!membership || !INVITE_ROLES.has(membership.role)) return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Your role cannot invite users.' } }, { status: 403 });
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = typeof body?.role === 'string' ? body.role.toUpperCase() : 'VIEWER';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !ASSIGNABLE_ROLES.has(role)) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Provide a valid email and role (ADMIN, MANAGER, REGISTRAR, VIEWER).' } }, { status: 400 });
  if (membership.role !== 'OWNER' && role === 'ADMIN') return NextResponse.json({ success: false, error: { code: 'PERMISSION_DENIED', message: 'Only workspace owners can invite administrators.' } }, { status: 403 });
  try {
    const db = await getDatabase();
    const existing = await db.collection('invitations').findOne({ tenant_id: tenant, email_normalized: email, status: 'PENDING', expires_at: { $gt: new Date() } });
    if (existing) return NextResponse.json({ success: false, error: { code: 'INVITATION_EXISTS', message: 'A pending invitation already exists for this email.' } }, { status: 409 });
    const rawToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const invitation = { tenant_id: tenant, email, email_normalized: email, role, status: 'PENDING', token_hash: createHash('sha256').update(rawToken).digest('hex'), created_by: auth.user.id, created_at: now, expires_at: new Date(now.getTime() + 7 * 86400000) };
    const result = await db.collection('invitations').insertOne(invitation);
    const origin = process.env.APP_BASE_URL?.trim().replace(/\/$/, '');
    return NextResponse.json({ success: true, data: { id: result.insertedId.toString(), email, role, status: 'PENDING', expires_at: invitation.expires_at, invitation_url: origin ? origin + '/accept-invitation?token=' + encodeURIComponent(rawToken) : null }, message: origin ? 'Invitation created. Share the link securely with the invitee.' : 'Invitation created; configure APP_BASE_URL to generate a link.' }, { status: 201 });
  } catch (error) { const e = mongoUnavailable(error); return NextResponse.json({ success: false, error: { code: 'DATABASE_ERROR', message: e.message } }, { status: e.status }); }
}
