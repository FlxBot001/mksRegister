import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAuthContext, supabaseFetch } from '@/lib/supabase/server';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in with the invited email address first.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send an invitation token.' } }, { status: 400 }); }
  const token = typeof body?.token === 'string' ? body.token : '';
  if (token.length < 32 || token.length > 200) return NextResponse.json({ success: false, error: { code: 'INVALID_INVITATION', message: 'Invitation token is invalid.' } }, { status: 400 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return NextResponse.json({ success: false, error: { code: 'INVITATION_SETUP_REQUIRED', message: 'Invitation acceptance requires server-side membership provisioning to be configured.' } }, { status: 503 });
  try {
    const db = await getDatabase();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const invite = await db.collection('invitations').findOne({ token_hash: tokenHash, status: 'PENDING', expires_at: { $gt: new Date() } });
    if (!invite) return NextResponse.json({ success: false, error: { code: 'INVITATION_INVALID_OR_EXPIRED', message: 'This invitation is invalid, expired, or already used.' } }, { status: 404 });
    if (!auth.user.email || auth.user.email.toLowerCase() !== invite.email_normalized) return NextResponse.json({ success: false, error: { code: 'INVITATION_EMAIL_MISMATCH', message: 'Sign in with the email address that received this invitation.' } }, { status: 403 });
    const configUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
    if (!configUrl) return NextResponse.json({ success: false, error: { code: 'INVITATION_SETUP_REQUIRED', message: 'Supabase server configuration is incomplete.' } }, { status: 503 });
    const response = await fetch(configUrl + '/rest/v1/tenant_memberships?on_conflict=tenant_id,user_id', {
      method: 'POST', cache: 'no-store',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ tenant_id: invite.tenant_id, user_id: auth.user.id, role: invite.role, status: 'ACTIVE' }),
    });
    if (!response.ok) return NextResponse.json({ success: false, error: { code: 'MEMBERSHIP_PROVISION_FAILED', message: 'Could not provision workspace access. Check server-side permissions.' } }, { status: 502 });
    const update = await db.collection('invitations').updateOne({ _id: invite._id, status: 'PENDING', token_hash: tokenHash }, { $set: { status: 'ACCEPTED', accepted_by: auth.user.id, accepted_at: new Date() }, $unset: { token_hash: '' } });
    if (!update.modifiedCount) return NextResponse.json({ success: false, error: { code: 'INVITATION_ALREADY_USED', message: 'This invitation has already been accepted.' } }, { status: 409 });
    return NextResponse.json({ success: true, data: { tenant_id: invite.tenant_id, role: invite.role }, message: 'Invitation accepted. Your workspace access is active.' });
  } catch (error) {
    const e = mongoUnavailable(error);
    return NextResponse.json({ success: false, error: { code: 'INVITATION_ACCEPT_FAILED', message: e.message } }, { status: e.status });
  }
}
