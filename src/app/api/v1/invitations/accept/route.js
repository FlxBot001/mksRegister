import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { createHash } from 'node:crypto';
import { getAuthContext } from '@/lib/auth/server';
import { getDatabase, mongoUnavailable } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const auth = await getAuthContext();
  if (!auth.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Create an account or sign in with the invited email address first.' } }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send an invitation token.' } }, { status: 400 }); }
  const token = typeof body?.token === 'string' ? body.token : '';
  if (token.length < 32 || token.length > 200) return NextResponse.json({ success: false, error: { code: 'INVALID_INVITATION', message: 'Invitation token is invalid.' } }, { status: 400 });
  try {
    const db = await getDatabase();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const invite = await db.collection('invitations').findOne({ token_hash: tokenHash, status: 'PENDING', expires_at: { $gt: now } });
    if (!invite) return NextResponse.json({ success: false, error: { code: 'INVITATION_INVALID_OR_EXPIRED', message: 'This invitation is invalid, expired, or already used.' } }, { status: 404 });
    if (!auth.user.email || auth.user.email.toLowerCase() !== invite.email_normalized) return NextResponse.json({ success: false, error: { code: 'INVITATION_EMAIL_MISMATCH', message: 'Sign in with the email address that received this invitation.' } }, { status: 403 });
    if (!ObjectId.isValid(invite.tenant_id)) return NextResponse.json({ success: false, error: { code: 'INVITATION_INVALID', message: 'This invitation references an invalid workspace.' } }, { status: 409 });
    const claim = await db.collection('invitations').updateOne({ _id: invite._id, status: 'PENDING', token_hash: tokenHash, expires_at: { $gt: now } }, { $set: { status: 'ACCEPTING', accepted_by: auth.user.id, accepting_at: now } });
    if (!claim.modifiedCount) return NextResponse.json({ success: false, error: { code: 'INVITATION_ALREADY_USED', message: 'This invitation has already been accepted.' } }, { status: 409 });
    try {
      const membership = { tenant_id: invite.tenant_id, user_id: new ObjectId(auth.user.id), role: invite.role, status: 'ACTIVE', created_at: now, updated_at: now, invited_by: invite.created_by };
      await db.collection('memberships').updateOne({ tenant_id: invite.tenant_id, user_id: new ObjectId(auth.user.id) }, { $setOnInsert: membership }, { upsert: true });
      await db.collection('invitations').updateOne({ _id: invite._id, status: 'ACCEPTING' }, { $set: { status: 'ACCEPTED', accepted_at: new Date() }, $unset: { token_hash: '', accepting_at: '' } });
      await db.collection('audit_logs').insertOne({ tenant_id: invite.tenant_id, actor_id: auth.user.id, action: 'invitation.accepted', entity_type: 'invitation', entity_id: invite._id.toString(), created_at: new Date() });
    } catch (error) {
      await db.collection('invitations').updateOne({ _id: invite._id, status: 'ACCEPTING' }, { $set: { status: 'PENDING' }, $unset: { accepting_at: '', accepted_by: '' } }).catch(() => null);
      throw error;
    }
    return NextResponse.json({ success: true, data: { tenant_id: invite.tenant_id, role: invite.role }, message: 'Invitation accepted. Your workspace access is active.' });
  } catch (error) {
    const e = mongoUnavailable(error);
    return NextResponse.json({ success: false, error: { code: 'INVITATION_ACCEPT_FAILED', message: e.message } }, { status: e.status });
  }
}
