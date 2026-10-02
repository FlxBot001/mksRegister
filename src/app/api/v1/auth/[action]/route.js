import { NextResponse } from 'next/server';
import { clearSessionCookies, getAuthContext, getSupabaseConfig, supabaseFetch } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { action } = await params;

  if (action === 'logout') {
    const context = await getAuthContext({ refresh: false });
    if (context.accessToken) await supabaseFetch('/auth/v1/logout', context.accessToken, { method: 'POST' }).catch(() => null);
    await clearSessionCookies();
    return NextResponse.json({ success: true, data: null, message: 'Signed out.' });
  }

  if (action !== 'login') return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } }, { status: 404 });

  const config = getSupabaseConfig();
  if (config.error) return NextResponse.json({ success: false, error: { code: 'CONFIGURATION_ERROR', message: config.error } }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: { code: 'INVALID_JSON', message: 'Send valid JSON.' } }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ success: false, error: { code: 'INVALID_BODY', message: 'Request body must be a JSON object.' } }, { status: 400 });

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 1024) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter a valid email address and password.' } }, { status: 400 });
  }

  const upstream = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', cache: 'no-store', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const raw = await upstream.text();
  let session = null;
  try { session = raw ? JSON.parse(raw) : null; } catch { session = null; }
  if (!upstream.ok || !session?.access_token || !session?.refresh_token || !session?.user?.id) {
    return NextResponse.json({ success: false, error: { code: 'AUTHENTICATION_FAILED', message: 'We could not sign you in with those credentials.' } }, { status: 401 });
  }

  const response = NextResponse.json({ success: true, data: { user: { id: session.user.id, email: session.user.email } }, message: 'Signed in successfully.' });
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set('mks_access_token', session.access_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.max(60, Number(session.expires_in) || 3600) });
  response.cookies.set('mks_refresh_token', session.refresh_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return response;
}

export async function GET(request, { params }) {
  const { action } = await params;
  if (action !== 'session') return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } }, { status: 404 });
  const context = await getAuthContext();
  if (!context.user) return NextResponse.json({ success: false, error: { code: 'UNAUTHENTICATED', message: context.error || 'Please sign in.' } }, { status: 401 });
  return NextResponse.json({ success: true, data: { user: { id: context.user.id, email: context.user.email } }, message: 'Session active.' });
}
