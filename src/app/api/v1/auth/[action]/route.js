import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { beginLoginAttempt, recordLoginAttempt } from '@/lib/auth/login-security';
import { isValidEmail, isValidNewPassword, normalizeEmail } from '@/lib/auth/policy.mjs';
import { clearSessionCookies, getAuthContext, getSupabaseConfig, supabaseFetch } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const fail = (code, message, status, headers = {}) => NextResponse.json(
  { success: false, error: { code, message } },
  { status, headers },
);

async function readBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: fail('INVALID_BODY', 'Request body must be a JSON object.', 400) };
    return { body };
  } catch {
    return { error: fail('INVALID_JSON', 'Send valid JSON.', 400) };
  }
}

function cookieOptions(maxAge = 0) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

function setSessionCookies(response, session, remember = false) {
  response.cookies.set('mks_access_token', session.access_token, cookieOptions(Math.max(60, Number(session.expires_in) || 3600)));
  response.cookies.set('mks_refresh_token', session.refresh_token, cookieOptions(remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8));
  response.cookies.set('mks_remember_session', remember ? 'true' : 'false', cookieOptions(remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8));
}

function clearAuthCookies(response) {
  for (const name of ['mks_access_token', 'mks_refresh_token', 'mks_remember_session', 'mks_mfa_pending_access', 'mks_mfa_pending_refresh', 'mks_mfa_pending_factor', 'mks_mfa_pending_remember']) {
    response.cookies.set(name, '', cookieOptions(0));
  }
}

function setPendingMfaCookies(response, session, factor, remember) {
  const pendingAge = 5 * 60;
  clearAuthCookies(response);
  response.cookies.set('mks_mfa_pending_access', session.access_token, cookieOptions(pendingAge));
  response.cookies.set('mks_mfa_pending_refresh', session.refresh_token, cookieOptions(pendingAge));
  response.cookies.set('mks_mfa_pending_factor', factor.id, cookieOptions(pendingAge));
  response.cookies.set('mks_mfa_pending_remember', remember ? 'true' : 'false', cookieOptions(pendingAge));
}

function clearPendingMfaCookies(response) {
  for (const name of ['mks_mfa_pending_access', 'mks_mfa_pending_refresh', 'mks_mfa_pending_factor', 'mks_mfa_pending_remember']) {
    response.cookies.set(name, '', cookieOptions(0));
  }
}

function allFactors(data) {
  if (Array.isArray(data?.all)) return data.all;
  if (Array.isArray(data)) return data;
  return [
    ...(Array.isArray(data?.totp) ? data.totp : []),
    ...(Array.isArray(data?.phone) ? data.phone : []),
  ];
}

function verifiedFactors(data) {
  return allFactors(data).filter((factor) => factor?.status === 'verified');
}

async function getFactors(accessToken) {
  const result = await supabaseFetch('/auth/v1/factors', accessToken);
  if (!result.ok) return { ok: false, status: result.status, factors: [] };
  return { ok: true, status: result.status, factors: allFactors(result.data) };
}

async function challengeAndVerify(accessToken, factorId, code) {
  const challenge = await supabaseFetch(`/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, accessToken, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!challenge.ok || !challenge.data?.id) return { ok: false, status: challenge.status || 502 };
  const verified = await supabaseFetch(`/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challenge.data.id, code }),
  });
  if (!verified.ok || !verified.data?.access_token || !verified.data?.refresh_token) {
    return { ok: false, status: verified.status || 401 };
  }
  return { ok: true, session: verified.data };
}

export async function POST(request, { params }) {
  const { action } = await params;

  if (action === 'mfa-cancel') {
    const response = NextResponse.json({ success: true, data: null, message: 'Authenticator sign-in cancelled.' });
    clearPendingMfaCookies(response);
    return response;
  }

  if (action === 'logout' || action === 'revoke-sessions') {
    const cookieStore = await cookies();
    const context = await getAuthContext().catch(() => ({ accessToken: null }));
    const accessToken = context.accessToken || cookieStore.get('mks_mfa_pending_access')?.value;
    let providerRevoked = false;
    if (accessToken) {
      const scope = action === 'revoke-sessions' ? '?scope=global' : '';
      const result = await supabaseFetch(`/auth/v1/logout${scope}`, accessToken, { method: 'POST' }).catch(() => null);
      providerRevoked = Boolean(result?.ok);
    }
    await clearSessionCookies();
    const response = NextResponse.json({
      success: true,
      data: null,
      message: action === 'revoke-sessions'
        ? providerRevoked
          ? 'Global session revocation was accepted by the authentication provider.'
          : 'This browser will be signed out, but provider-wide revocation could not be confirmed.'
        : 'Signed out of this browser.',
    });
    clearAuthCookies(response);
    return response;
  }

  const config = getSupabaseConfig();
  if (config.error) return fail('CONFIGURATION_ERROR', 'Authentication is not configured. Contact your administrator.', 503);

  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  if (action === 'mfa-verify') {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('mks_mfa_pending_access')?.value;
    const factorId = cookieStore.get('mks_mfa_pending_factor')?.value;
    const remember = cookieStore.get('mks_mfa_pending_remember')?.value === 'true';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!accessToken || !factorId || !/^\d{6,8}$/.test(code)) {
      return fail('MFA_CHALLENGE_REQUIRED', 'Sign in again and enter the current code from your authenticator app.', 401);
    }

    const identity = await supabaseFetch('/auth/v1/user', accessToken);
    if (!identity.ok || !identity.data?.id || !isValidEmail(identity.data?.email)) {
      const response = fail('MFA_SESSION_EXPIRED', 'This sign-in challenge expired. Please sign in again.', 401);
      clearPendingMfaCookies(response);
      return response;
    }

    let throttle;
    try {
      throttle = await beginLoginAttempt(request, identity.data.email);
    } catch (error) {
      console.error('Unable to apply MFA verification throttling.', error);
      return fail('AUTH_SECURITY_UNAVAILABLE', 'Verification is temporarily unavailable. Please try again shortly.', 503);
    }
    if (throttle.limited) {
      return fail('RATE_LIMITED', 'Too many verification attempts. Wait a little before trying again.', 429, {
        'Retry-After': String(throttle.retryAfter),
      });
    }

    const factorList = await getFactors(accessToken);
    const factor = factorList.factors.find((item) => item.id === factorId && item.status === 'verified');
    if (!factorList.ok || !factor) return fail('MFA_FACTOR_UNAVAILABLE', 'This authenticator is no longer available. Sign in again or contact your administrator.', 401);

    const verification = await challengeAndVerify(accessToken, factorId, code);
    if (!verification.ok) {
      await recordLoginAttempt(request, identity.data.email, { success: false, userId: identity.data.id, reason: 'invalid_mfa_code', eventType: 'mfa_failed' }).catch(() => null);
      return fail('MFA_CODE_INVALID', 'That code could not be verified. Check your authenticator and try again.', verification.status === 429 ? 429 : 401);
    }

    try {
      await recordLoginAttempt(request, identity.data.email, { success: true, userId: identity.data.id, reason: 'authenticator_verified', eventType: 'mfa_verified' });
    } catch (error) {
      console.error('Unable to record successful MFA verification.', error);
      await supabaseFetch('/auth/v1/logout?scope=global', verification.session.access_token, { method: 'POST' }).catch(() => null);
      return fail('AUTH_AUDIT_UNAVAILABLE', 'Sign-in could not be completed safely. Please try again.', 503);
    }

    const response = NextResponse.json({
      success: true,
      data: { user: { id: verification.session.user?.id || identity.data.id, email: verification.session.user?.email || identity.data.email } },
      message: 'Authenticator verified.',
    });
    setSessionCookies(response, verification.session, remember);
    clearPendingMfaCookies(response);
    return response;
  }

  if (action === 'mfa-enroll') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in again.', 401);
    const friendlyName = typeof body.friendly_name === 'string' ? body.friendly_name.trim().slice(0, 80) : 'MKS Register authenticator';
    const enrolled = await supabaseFetch('/auth/v1/factors', context.accessToken, {
      method: 'POST',
      body: JSON.stringify({ factor_type: 'totp', friendly_name: friendlyName || 'MKS Register authenticator', issuer: 'MKS Register' }),
    });
    if (!enrolled.ok || !enrolled.data?.id || !enrolled.data?.totp?.qr_code) {
      return fail('MFA_ENROLL_FAILED', 'Could not start authenticator setup. Check provider settings and try again.', enrolled.status || 502);
    }
    return NextResponse.json({
      success: true,
      data: {
        factor: {
          id: enrolled.data.id,
          friendly_name: enrolled.data.friendly_name || friendlyName,
          qr_code: enrolled.data.totp.qr_code,
          secret: enrolled.data.totp.secret,
          uri: enrolled.data.totp.uri,
        },
      },
      message: 'Scan the QR code and verify a code to enable the authenticator.',
    });
  }

  if (action === 'mfa-enroll-verify') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in again.', 401);
    const factorId = typeof body.factor_id === 'string' ? body.factor_id : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(factorId) || !/^\d{6,8}$/.test(code)) return fail('VALIDATION_ERROR', 'Enter the six-digit code from your authenticator app.', 400);
    const verification = await challengeAndVerify(context.accessToken, factorId, code);
    if (!verification.ok) return fail('MFA_CODE_INVALID', 'That code could not be verified. Try the current code from your authenticator app.', verification.status === 429 ? 429 : 400);
    if (verification.session.user?.id && verification.session.user.id !== context.user.id) return fail('MFA_IDENTITY_MISMATCH', 'The authenticator response did not match this account.', 403);
    const response = NextResponse.json({ success: true, data: { enabled: true }, message: 'Authenticator enabled successfully.' });
    const cookieStore = await cookies();
    setSessionCookies(response, verification.session, cookieStore.get('mks_remember_session')?.value === 'true');
    return response;
  }

  if (action === 'mfa-unenroll') {
    const context = await getAuthContext();
    if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in again.', 401);
    const factorId = typeof body.factor_id === 'string' ? body.factor_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(factorId)) return fail('VALIDATION_ERROR', 'Choose a valid authenticator.', 400);
    const removed = await supabaseFetch(`/auth/v1/factors/${encodeURIComponent(factorId)}`, context.accessToken, { method: 'DELETE' });
    if (!removed.ok) return fail('MFA_UNENROLL_FAILED', 'Could not remove this authenticator. Try again or contact your administrator.', removed.status || 502);
    return NextResponse.json({ success: true, data: null, message: 'Authenticator removed.' });
  }

  if (action === 'recover') {
    if (!isValidEmail(body.email)) return fail('VALIDATION_ERROR', 'Enter a valid email address.', 400);
    const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).trim().replace(/\/$/, '');
    try {
      await fetch(`${config.url}/auth/v1/recover`, {
        method: 'POST',
        cache: 'no-store',
        headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizeEmail(body.email), redirect_to: `${baseUrl}/reset-password` }),
      });
    } catch {
      // Keep the response indistinguishable to avoid revealing whether an account exists.
    }
    return NextResponse.json({
      success: true,
      data: null,
      message: 'If an account matches that email, password-reset instructions will be sent.',
    });
  }

  if (action === 'reset-password') {
    const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!accessToken || !refreshToken || !isValidNewPassword(password)) {
      return fail('VALIDATION_ERROR', 'Open the latest reset link and choose a password with at least 12 characters.', 400);
    }
    const saved = await supabaseFetch('/auth/v1/user', accessToken, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
    if (!saved.ok || !saved.data?.id) {
      return fail('RESET_LINK_INVALID', 'This reset link is invalid or expired. Request a new one and try again.', 401);
    }
    await supabaseFetch('/auth/v1/logout?scope=global', accessToken, { method: 'POST' }).catch(() => null);
    const response = NextResponse.json({
      success: true,
      data: { user: { id: saved.data.id, email: saved.data.email } },
      message: 'Password updated. Sign in again to continue.',
    });
    clearAuthCookies(response);
    return response;
  }

  if (action !== 'login') return fail('NOT_FOUND', 'Route not found.', 404);

  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!isValidEmail(email) || !password || password.length > 1024) {
    return fail('VALIDATION_ERROR', 'Enter a valid email address and password.', 400);
  }

  let throttle;
  try {
    throttle = await beginLoginAttempt(request, email);
  } catch (error) {
    console.error('Unable to apply persistent login throttling.', error);
    return fail('AUTH_SECURITY_UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again shortly.', 503);
  }
  if (throttle.limited) {
    return fail('RATE_LIMITED', 'Too many sign-in attempts. Wait a little before trying again.', 429, {
      'Retry-After': String(throttle.retryAfter),
    });
  }

  let upstream;
  try {
    upstream = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      cache: 'no-store',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    await recordLoginAttempt(request, email, { success: false, reason: 'auth_provider_unavailable' }).catch(() => null);
    return fail('AUTH_PROVIDER_UNAVAILABLE', 'The sign-in service is temporarily unavailable. Please try again.', 503);
  }

  const raw = await upstream.text();
  let session = null;
  try { session = raw ? JSON.parse(raw) : null; } catch { session = null; }
  if (!upstream.ok || !session?.access_token || !session?.refresh_token || !session?.user?.id) {
    await recordLoginAttempt(request, email, { success: false, reason: 'invalid_credentials' }).catch((error) => {
      console.error('Unable to record failed sign-in.', error);
    });
    return fail('AUTHENTICATION_FAILED', 'We could not sign you in with those credentials.', 401);
  }

  let factors;
  try {
    factors = await getFactors(session.access_token);
  } catch {
    factors = { ok: false, factors: [] };
  }
  if (!factors.ok) {
    await supabaseFetch('/auth/v1/logout', session.access_token, { method: 'POST' }).catch(() => null);
    return fail('AUTH_SECURITY_UNAVAILABLE', 'We could not verify your account security settings. Please try again.', 503);
  }

  const verified = verifiedFactors(factors.factors);
  if (verified.length) {
    try {
      await recordLoginAttempt(request, email, { success: true, userId: session.user.id, reason: 'password_verified_mfa_required', eventType: 'primary_factor_succeeded' });
    } catch (error) {
      console.error('Unable to record primary-factor sign-in.', error);
      await supabaseFetch('/auth/v1/logout', session.access_token, { method: 'POST' }).catch(() => null);
      return fail('AUTH_AUDIT_UNAVAILABLE', 'Sign-in could not be completed safely. Please try again.', 503);
    }
    const response = NextResponse.json({
      success: true,
      data: { mfa_required: true, factor_label: verified[0].friendly_name || 'Authenticator app' },
      message: 'Enter the current code from your authenticator app.',
    });
    setPendingMfaCookies(response, session, verified[0], body.remember_session === true);
    return response;
  }

  try {
    await recordLoginAttempt(request, email, { success: true, userId: session.user.id });
  } catch (error) {
    console.error('Unable to record successful sign-in.', error);
    await supabaseFetch('/auth/v1/logout', session.access_token, { method: 'POST' }).catch(() => null);
    return fail('AUTH_AUDIT_UNAVAILABLE', 'Sign-in could not be completed safely. Please try again.', 503);
  }

  const response = NextResponse.json({
    success: true,
    data: { user: { id: session.user.id, email: session.user.email } },
    message: 'Signed in successfully.',
  });
  setSessionCookies(response, session, body.remember_session === true);
  return response;
}

export async function GET(request, { params }) {
  const { action } = await params;
  if (action === 'mfa-factors') {
    const context = await getAuthContext();
    if (!context.user) {
      const unavailable = /temporarily unavailable|not configured|configuration/i.test(context.error || '');
      return fail(unavailable ? 'AUTH_CONFIGURATION_ERROR' : 'UNAUTHENTICATED', unavailable ? 'Authentication security is temporarily unavailable.' : context.error || 'Please sign in.', unavailable ? 503 : 401);
    }
    const result = await getFactors(context.accessToken);
    if (!result.ok) return fail('MFA_FACTORS_UNAVAILABLE', 'Could not load authenticator settings.', result.status || 503);
    return NextResponse.json({
      success: true,
      data: result.factors.map((factor) => ({
        id: factor.id,
        factor_type: factor.factor_type || factor.type,
        status: factor.status,
        friendly_name: factor.friendly_name || 'Authenticator',
        created_at: factor.created_at || null,
      })),
    });
  }

  if (action !== 'session') return fail('NOT_FOUND', 'Route not found.', 404);
  const context = await getAuthContext();
  if (!context.user) {
    const unavailable = /not configured|configuration|temporarily unavailable|security service/i.test(context.error || '');
    return fail(unavailable ? 'AUTH_CONFIGURATION_ERROR' : 'UNAUTHENTICATED', unavailable ? 'Authentication is not configured or temporarily unavailable. Contact your administrator.' : context.error || 'Please sign in.', unavailable ? 503 : 401);
  }
  return NextResponse.json({
    success: true,
    data: { user: { id: context.user.id, email: context.user.email } },
    message: 'Session active.',
  });
}
