import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { beginLoginAttempt, recordLoginAttempt } from '@/lib/auth/login-security';
import { isValidEmail, isValidNewPassword, normalizeEmail } from '@/lib/auth/policy.mjs';
import { createSession, getAuthContext, setSessionCookies, clearAuthCookies, SESSION_COOKIE, sessionCookieOptions, revokeSession, revokeAllSessions } from '@/lib/auth/server';
import { decryptSecret, encryptSecret, generateTotpSecret, hashPassword, sha256, totpUri, verifyPassword, verifyTotp } from '@/lib/auth/credentials.mjs';
import { getDatabase } from '@/lib/mongodb/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const fail = (code, message, status, headers = {}) => NextResponse.json({ success: false, error: { code, message } }, { status, headers });
async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? { body } : { error: fail('INVALID_BODY', 'Request body must be a JSON object.', 400) };
  } catch { return { error: fail('INVALID_JSON', 'Send valid JSON.', 400) }; }
}
function cleanUser(user) {
  return { id: user._id.toString(), email: user.email, full_name: user.full_name || '', created_at: user.created_at };
}
async function sendRecoveryEmail(email, token, origin) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!apiKey || !from) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Reset your MKS Register password',
      text: `A password reset was requested for your MKS Register account. Open this link within 30 minutes: ${origin}/reset-password?token=${encodeURIComponent(token)}. If you did not request this, you can ignore this email.`,
    }),
  });
  return response.ok;
}

export async function POST(request, { params }) {
  const { action } = await params;
  if (action === 'logout' || action === 'revoke-sessions' || action === 'mfa-cancel') {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE)?.value;
    if (action === 'revoke-sessions' && raw) {
      try {
        const context = await getAuthContext();
        if (context.user) await revokeAllSessions(context.user.id);
      } catch { /* Clear the local session even if the database is unavailable. */ }
    } else if (raw) {
      try { await revokeSession(raw); } catch { /* Clear the local cookie regardless. */ }
    }
    const response = NextResponse.json({ success: true, data: null, message: action === 'revoke-sessions' ? 'All active sessions for this account were revoked.' : action === 'mfa-cancel' ? 'Authenticator sign-in cancelled.' : 'Signed out.' });
    clearAuthCookies(response);
    for (const name of ['mks_mfa_pending_token', 'mks_mfa_pending_remember']) response.cookies.set(name, '', sessionCookieOptions(0));
    return response;
  }

  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  if (action === 'register') {
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName = typeof body.full_name === 'string' ? body.full_name.trim().replace(/\s+/g, ' ') : '';
    if (!isValidEmail(email) || !isValidNewPassword(password) || fullName.length < 2 || fullName.length > 120) return fail('VALIDATION_ERROR', 'Enter a valid email, a name of 2–120 characters, and a password with at least 12 characters.', 400);
    let throttle;
    try { throttle = await beginLoginAttempt(request, email, 'register'); }
    catch (error) { console.error('Unable to apply registration throttling.', error); return fail('AUTH_SECURITY_UNAVAILABLE', 'Registration is temporarily unavailable. Please try again shortly.', 503); }
    if (throttle.limited) return fail('RATE_LIMITED', 'Too many attempts. Wait a little before trying again.', 429, { 'Retry-After': String(throttle.retryAfter) });
    try {
      const db = await getDatabase();
      const existing = await db.collection('users').findOne({ email_normalized: email }, { projection: { _id: 1 } });
      if (existing) return fail('ACCOUNT_EXISTS', 'An account with this email already exists. Sign in or reset your password.', 409);
      const now = new Date();
      const user = { _id: new ObjectId(), email, email_normalized: email, full_name: fullName, password_hash: await hashPassword(password), status: 'ACTIVE', email_verified: false, mfa_enabled: false, created_at: now, updated_at: now, password_changed_at: now };
      await db.collection('users').insertOne(user);
      await recordLoginAttempt(request, email, { success: true, userId: user._id.toString(), reason: 'account_created', eventType: 'account_registered' });
      const session = await createSession(user, { remember: false, request });
      const response = NextResponse.json({ success: true, data: { user: cleanUser(user) }, message: 'Your account has been created.' }, { status: 201 });
      setSessionCookies(response, session.rawToken, false);
      return response;
    } catch (error) {
      if (error?.code === 11000) return fail('ACCOUNT_EXISTS', 'An account with this email already exists. Sign in or reset your password.', 409);
      console.error('MongoDB registration failed.', error);
      return fail('REGISTRATION_UNAVAILABLE', 'Account creation is temporarily unavailable.', 503);
    }
  }

  if (action === 'login') {
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!isValidEmail(email) || !password || password.length > 1024) return fail('VALIDATION_ERROR', 'Enter a valid email address and password.', 400);
    let throttle;
    try { throttle = await beginLoginAttempt(request, email); }
    catch (error) { console.error('Unable to apply login throttling.', error); return fail('AUTH_SECURITY_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again shortly.', 503); }
    if (throttle.limited) return fail('RATE_LIMITED', 'Too many sign-in attempts. Wait a little before trying again.', 429, { 'Retry-After': String(throttle.retryAfter) });
    try {
      const db = await getDatabase();
      const user = await db.collection('users').findOne({ email_normalized: email });
      if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.password_hash))) {
        await recordLoginAttempt(request, email, { success: false, reason: 'invalid_credentials' }).catch(() => null);
        return fail('AUTHENTICATION_FAILED', 'We could not sign you in with those credentials.', 401);
      }
      if (user.mfa_enabled && user.mfa_secret) {
        const pending = randomBytes(32).toString('base64url');
        await db.collection('mfa_challenges').insertOne({ token_hash: sha256(pending), user_id: user._id, remember: body.remember_session === true, expires_at: new Date(Date.now() + 5 * 60 * 1000), created_at: new Date() });
        const response = NextResponse.json({ success: true, data: { mfa_required: true, factor_label: 'Authenticator app' }, message: 'Enter the current code from your authenticator app.' });
        response.cookies.set('mks_mfa_pending_token', pending, sessionCookieOptions(300));
        response.cookies.set('mks_mfa_pending_remember', body.remember_session === true ? 'true' : 'false', sessionCookieOptions(300));
        await recordLoginAttempt(request, email, { success: true, userId: user._id.toString(), reason: 'password_verified_mfa_required', eventType: 'primary_factor_succeeded' }).catch(() => null);
        return response;
      }
      await recordLoginAttempt(request, email, { success: true, userId: user._id.toString() });
      const session = await createSession(user, { remember: body.remember_session === true, request });
      const response = NextResponse.json({ success: true, data: { user: cleanUser(user) }, message: 'Signed in successfully.' });
      setSessionCookies(response, session.rawToken, body.remember_session === true);
      return response;
    } catch (error) {
      console.error('MongoDB sign-in failed.', error);
      return fail('AUTH_SERVICE_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again.', 503);
    }
  }

  if (action === 'mfa-verify') {
    const store = await cookies();
    const pending = store.get('mks_mfa_pending_token')?.value;
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!pending || !/^\d{6}$/.test(code)) return fail('MFA_CHALLENGE_REQUIRED', 'Sign in again and enter the current code from your authenticator app.', 401);
    try {
      const db = await getDatabase();
      const challenge = await db.collection('mfa_challenges').findOne({ token_hash: sha256(pending), expires_at: { $gt: new Date() } });
      if (!challenge) return fail('MFA_SESSION_EXPIRED', 'This sign-in challenge expired. Please sign in again.', 401);
      const user = await db.collection('users').findOne({ _id: challenge.user_id, status: 'ACTIVE', mfa_enabled: true });
      if (!user?.mfa_secret || !verifyTotp(decryptSecret(user.mfa_secret), code)) {
        await recordLoginAttempt(request, user?.email || '', { success: false, userId: user?._id.toString(), reason: 'invalid_mfa_code', eventType: 'mfa_failed' }).catch(() => null);
        return fail('MFA_CODE_INVALID', 'That code could not be verified. Check your authenticator and try again.', 401);
      }
      await db.collection('mfa_challenges').deleteOne({ _id: challenge._id });
      await recordLoginAttempt(request, user.email, { success: true, userId: user._id.toString(), reason: 'authenticator_verified', eventType: 'mfa_verified' });
      const remember = store.get('mks_mfa_pending_remember')?.value === 'true';
      const session = await createSession(user, { remember, request, mfaVerified: true });
      const response = NextResponse.json({ success: true, data: { user: cleanUser(user) }, message: 'Authenticator verified.' });
      setSessionCookies(response, session.rawToken, remember);
      response.cookies.set('mks_mfa_pending_token', '', sessionCookieOptions(0));
      response.cookies.set('mks_mfa_pending_remember', '', sessionCookieOptions(0));
      return response;
    } catch (error) { console.error('MFA verification failed.', error); return fail('MFA_SERVICE_UNAVAILABLE', 'Authenticator verification is temporarily unavailable.', 503); }
  }

  if (action === 'recover') {
    if (!isValidEmail(body.email)) return fail('VALIDATION_ERROR', 'Enter a valid email address.', 400);
    const email = normalizeEmail(body.email);
    try {
      const db = await getDatabase();
      const user = await db.collection('users').findOne({ email_normalized: email, status: 'ACTIVE' });
      if (user) {
        const token = randomBytes(32).toString('base64url');
        await db.collection('password_resets').insertOne({ token_hash: sha256(token), user_id: user._id, created_at: new Date(), expires_at: new Date(Date.now() + 30 * 60 * 1000), used_at: null });
        const origin = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');
        await sendRecoveryEmail(user.email, token, origin).catch((error) => console.error('Password recovery email could not be sent.', error));
      }
    } catch (error) { console.error('Password recovery request failed.', error); }
    return NextResponse.json({ success: true, data: null, message: 'If an account matches that email and email delivery is configured, password-reset instructions will be sent.' });
  }

  if (action === 'reset-password') {
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (token.length < 32 || token.length > 200 || !isValidNewPassword(password)) return fail('VALIDATION_ERROR', 'Open a valid reset link and choose a password with at least 12 characters.', 400);
    try {
      const db = await getDatabase();
      const reset = await db.collection('password_resets').findOne({ token_hash: sha256(token), used_at: null, expires_at: { $gt: new Date() } });
      if (!reset) return fail('RESET_LINK_INVALID', 'This reset link is invalid or expired. Request a new one and try again.', 401);
      const passwordHash = await hashPassword(password);
      const saved = await db.collection('users').updateOne({ _id: reset.user_id, status: 'ACTIVE' }, { $set: { password_hash: passwordHash, password_changed_at: new Date(), updated_at: new Date() } });
      if (!saved.modifiedCount) return fail('RESET_LINK_INVALID', 'This reset link is invalid or expired. Request a new one and try again.', 401);
      await db.collection('password_resets').updateOne({ _id: reset._id, used_at: null }, { $set: { used_at: new Date() } });
      await revokeAllSessions(reset.user_id.toString());
      return NextResponse.json({ success: true, data: null, message: 'Password updated. Sign in again to continue.' });
    } catch (error) { console.error('Password reset failed.', error); return fail('RESET_FAILED', 'Password reset is temporarily unavailable.', 503); }
  }

  if (action === 'mfa-enroll') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in again.', 401);
    try {
      const db = await getDatabase();
      const secret = generateTotpSecret();
      await db.collection('users').updateOne({ _id: new ObjectId(context.user.id) }, { $set: { mfa_pending_secret: encryptSecret(secret), mfa_pending_expires_at: new Date(Date.now() + 10 * 60 * 1000) } });
      return NextResponse.json({ success: true, data: { factor: { id: 'totp', friendly_name: 'Authenticator app', secret, uri: totpUri(secret, context.user.email) } }, message: 'Add this authenticator and verify a code to enable MFA.' });
    } catch (error) { console.error('MFA enrollment failed.', error); return fail('MFA_ENROLL_FAILED', 'Could not start authenticator setup. Check server configuration and try again.', 503); }
  }

  if (action === 'mfa-enroll-verify') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in again.', 401);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    try {
      const db = await getDatabase();
      const user = await db.collection('users').findOne({ email_normalized: normalizeEmail(context.user.email), status: 'ACTIVE' });
      if (!user?.mfa_pending_secret || !user.mfa_pending_expires_at || user.mfa_pending_expires_at <= new Date()) return fail('MFA_ENROLLMENT_EXPIRED', 'Start authenticator setup again.', 409);
      if (!verifyTotp(decryptSecret(user.mfa_pending_secret), code)) return fail('MFA_CODE_INVALID', 'That code could not be verified. Try the current code.', 400);
      await db.collection('users').updateOne({ _id: user._id }, { $set: { mfa_secret: user.mfa_pending_secret, mfa_enabled: true, mfa_enabled_at: new Date(), updated_at: new Date() }, $unset: { mfa_pending_secret: '', mfa_pending_expires_at: '' } });
      return NextResponse.json({ success: true, data: { enabled: true }, message: 'Authenticator enabled successfully.' });
    } catch (error) { console.error('MFA enrollment verification failed.', error); return fail('MFA_ENROLL_FAILED', 'Could not enable the authenticator.', 503); }
  }

  if (action === 'mfa-unenroll') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in again.', 401);
    try {
      const db = await getDatabase();
      const user = await db.collection('users').findOne({ email_normalized: normalizeEmail(context.user.email), status: 'ACTIVE' });
      if (!user?.mfa_enabled) return NextResponse.json({ success: true, data: null, message: 'Authenticator is already disabled.' });
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!verifyTotp(decryptSecret(user.mfa_secret), code)) return fail('MFA_CODE_INVALID', 'Enter a current authenticator code to disable MFA.', 400);
      await db.collection('users').updateOne({ _id: user._id }, { $set: { mfa_enabled: false, updated_at: new Date() }, $unset: { mfa_secret: '', mfa_enabled_at: '' } });
      await revokeAllSessions(user._id.toString());
      return NextResponse.json({ success: true, data: null, message: 'Authenticator removed. Sign in again.' });
    } catch (error) { console.error('MFA removal failed.', error); return fail('MFA_UNENROLL_FAILED', 'Could not remove the authenticator.', 503); }
  }

  return fail('NOT_FOUND', 'Route not found.', 404);
}

export async function GET(_request, { params }) {
  const { action } = await params;
  if (action === 'session') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in.', 401);
    return NextResponse.json({ success: true, data: { user: context.user, session: context.session }, message: 'Session is active.' });
  }
  if (action === 'mfa-factors') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in.', 401);
    try {
      const db = await getDatabase();
      const user = await db.collection('users').findOne({ email_normalized: normalizeEmail(context.user.email) }, { projection: { mfa_enabled: 1 } });
      return NextResponse.json({ success: true, data: user?.mfa_enabled ? [{ id: 'totp', factor_type: 'totp', status: 'verified', friendly_name: 'Authenticator app' }] : [] });
    } catch { return fail('MFA_FACTORS_UNAVAILABLE', 'Could not load authenticator settings.', 503); }
  }
  return fail('NOT_FOUND', 'Route not found.', 404);
}
