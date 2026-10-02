import { NextResponse } from 'next/server';
import { beginLoginAttempt, recordLoginAttempt } from '@/lib/auth/login-security';
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

function setSessionCookies(response, session) {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set('mks_access_token', session.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60, Number(session.expires_in) || 3600),
  });
  response.cookies.set('mks_refresh_token', session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

function validEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request, { params }) {
  const { action } = await params;

  if (action === 'logout' || action === 'revoke-sessions') {
    const context = await getAuthContext().catch(() => ({ accessToken: null }));
    if (context.accessToken) {
      const scope = action === 'revoke-sessions' ? '?scope=global' : '';
      await supabaseFetch(`/auth/v1/logout${scope}`, context.accessToken, { method: 'POST' }).catch(() => null);
    }
    await clearSessionCookies();
    return NextResponse.json({
      success: true,
      data: null,
      message: action === 'revoke-sessions' ? 'Sessions have been revoked where supported.' : 'Signed out.',
    });
  }

  const config = getSupabaseConfig();
  if (config.error) return fail('CONFIGURATION_ERROR', 'Authentication is not configured. Contact your administrator.', 503);

  const parsed = await readBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.body;

  if (action === 'recover') {
    if (!validEmail(body.email)) return fail('VALIDATION_ERROR', 'Enter a valid email address.', 400);
    const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).trim().replace(/\/$/, '');
    try {
      await fetch(`${config.url}/auth/v1/recover`, {
        method: 'POST',
        cache: 'no-store',
        headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: body.email.trim().toLowerCase(), redirect_to: `${baseUrl}/reset-password` }),
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
    if (!accessToken || !refreshToken || password.length < 12 || password.length > 1024) {
      return fail('VALIDATION_ERROR', 'Open the latest reset link and choose a password with at least 12 characters.', 400);
    }
    const saved = await supabaseFetch('/auth/v1/user', accessToken, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
    if (!saved.ok || !saved.data?.id) {
      return fail('RESET_LINK_INVALID', 'This reset link is invalid or expired. Request a new one and try again.', 401);
    }
    const response = NextResponse.json({
      success: true,
      data: { user: { id: saved.data.id, email: saved.data.email } },
      message: 'Password updated successfully.',
    });
    setSessionCookies(response, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
    });
    return response;
  }

  if (action !== 'login') return fail('NOT_FOUND', 'Route not found.', 404);

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!validEmail(email) || !password || password.length > 1024) {
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
  setSessionCookies(response, session);
  return response;
}

export async function GET(request, { params }) {
  const { action } = await params;
  if (action !== 'session') return fail('NOT_FOUND', 'Route not found.', 404);
  const context = await getAuthContext();
  if (!context.user) return fail('UNAUTHENTICATED', context.error || 'Please sign in.', 401);
  return NextResponse.json({
    success: true,
    data: { user: { id: context.user.id, email: context.user.email } },
    message: 'Session active.',
  });
}
