import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { getDatabase } from '@/lib/mongodb/server';
import { sha256 } from '@/lib/auth/credentials.mjs';

export const SESSION_COOKIE = 'mks_session';
const REMEMBER_COOKIE = 'mks_remember_session';
const SECURE = process.env.NODE_ENV === 'production';

export function sessionCookieOptions(maxAge = 0) {
  return { httpOnly: true, secure: SECURE, sameSite: 'lax', path: '/', maxAge };
}

export function setSessionCookies(response, rawToken, remember = false) {
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
  response.cookies.set(SESSION_COOKIE, rawToken, sessionCookieOptions(maxAge));
  response.cookies.set(REMEMBER_COOKIE, remember ? 'true' : 'false', sessionCookieOptions(maxAge));
}

export function clearAuthCookies(response) {
  for (const name of [SESSION_COOKIE, REMEMBER_COOKIE, 'mks_access_token', 'mks_refresh_token', 'mks_mfa_pending_access', 'mks_mfa_pending_refresh', 'mks_mfa_pending_factor', 'mks_mfa_pending_remember']) {
    response.cookies.set(name, '', sessionCookieOptions(0));
  }
}

export async function createSession(user, { remember = false, request = null, mfaVerified = false } = {}) {
  const db = await getDatabase();
  const rawToken = randomBytes(32).toString('base64url');
  const now = new Date();
  const maxAgeMs = (remember ? 30 * 86400000 : 8 * 3600000);
  const address = request?.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || request?.headers?.get('x-real-ip') || 'unknown';
  await db.collection('sessions').insertOne({
    token_hash: sha256(rawToken),
    user_id: user._id,
    created_at: now,
    last_seen_at: now,
    expires_at: new Date(now.getTime() + maxAgeMs),
    absolute_expires_at: new Date(now.getTime() + (remember ? 30 * 86400000 : 8 * 3600000)),
    revoked_at: null,
    mfa_verified: Boolean(mfaVerified),
    ip_hash: sha256(address),
    user_agent: (request?.headers?.get('user-agent') || '').slice(0, 500),
  });
  return { rawToken, maxAge: Math.floor(maxAgeMs / 1000) };
}

export async function getAuthContext() {
  try {
    const store = await cookies();
    const rawToken = store.get(SESSION_COOKIE)?.value;
    if (!rawToken || rawToken.length < 32) return { user: null, accessToken: null, session: null, error: 'Please sign in.' };
    const db = await getDatabase();
    const now = new Date();
    const session = await db.collection('sessions').findOne({ token_hash: sha256(rawToken), revoked_at: null, expires_at: { $gt: now } });
    if (!session) return { user: null, accessToken: null, session: null, error: 'Your session has expired. Please sign in again.' };
    const user = await db.collection('users').findOne({ _id: session.user_id, status: 'ACTIVE' }, { projection: { password_hash: 0, recovery_tokens: 0, mfa_secret: 0 } });
    if (!user) return { user: null, accessToken: null, session: null, error: 'This account is not active. Contact your workspace administrator.' };
    await db.collection('sessions').updateOne({ _id: session._id }, { $set: { last_seen_at: now } });
    return { user: { id: user._id.toString(), email: user.email, user_metadata: { full_name: user.full_name || '' }, created_at: user.created_at }, accessToken: rawToken, session: { id: session._id.toString(), mfaVerified: session.mfa_verified }, error: null };
  } catch (error) {
    return { user: null, accessToken: null, session: null, error: String(error?.message || '').includes('not configured') ? 'The application database is not configured.' : 'Authentication is temporarily unavailable. Please try again.' };
  }
}

export async function revokeSession(rawToken) {
  if (!rawToken) return;
  const db = await getDatabase();
  await db.collection('sessions').updateOne({ token_hash: sha256(rawToken), revoked_at: null }, { $set: { revoked_at: new Date() } });
}

export async function revokeAllSessions(userId) {
  const db = await getDatabase();
  const result = await db.collection('sessions').updateMany({ user_id: userId, revoked_at: null }, { $set: { revoked_at: new Date() } });
  return result.modifiedCount;
}
