import 'server-only';
import { cookies } from 'next/headers';

const ACCESS_COOKIE = 'mks_access_token';
const REFRESH_COOKIE = 'mks_refresh_token';

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return { error: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in the server environment.' };
  try { new URL(url); } catch { return { error: 'SUPABASE_URL must be a valid absolute URL.' }; }
  return { url, anonKey };
}

export async function supabaseFetch(path, accessToken, options = {}) {
  const config = getSupabaseConfig();
  if (config.error) return { ok: false, status: 503, data: { message: config.error } };
  let response;
  try {
    response = await fetch(`${config.url}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken || config.anonKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    return { ok: false, status: 503, data: { message: 'The authentication service is temporarily unavailable.' } };
  }
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: 'The data service returned an unexpected response.' }; }
  return { ok: response.ok, status: response.status, data };
}

function tokenAssuranceLevel(accessToken) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    return payload.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

function verifiedFactors(data) {
  const factors = Array.isArray(data?.all)
    ? data.all
    : [...(Array.isArray(data?.totp) ? data.totp : []), ...(Array.isArray(data?.phone) ? data.phone : [])];
  return factors.filter((factor) => factor?.status === 'verified');
}

async function enforceMfaAssurance(user, accessToken) {
  const factors = await supabaseFetch('/auth/v1/factors', accessToken);
  if (!factors.ok) {
    return { user: null, accessToken: null, error: 'The authentication security service is temporarily unavailable. Please try again.' };
  }
  if (verifiedFactors(factors.data).length && tokenAssuranceLevel(accessToken) !== 'aal2') {
    return { user: null, accessToken: null, error: 'Additional verification is required. Sign in and complete the authenticator challenge.' };
  }
  return { user, accessToken, error: null };
}

function setSessionCookies(cookieStore, session) {
  const secure = process.env.NODE_ENV === 'production';
  const remember = cookieStore.get('mks_remember_session')?.value === 'true';
  cookieStore.set(ACCESS_COOKIE, session.access_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: Math.max(60, Number(session.expires_in) || 3600) });
  cookieStore.set(REFRESH_COOKIE, session.refresh_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8 });
}

export async function getAuthContext({ refresh = true } = {}) {
  const config = getSupabaseConfig();
  if (config.error) return { user: null, accessToken: null, error: config.error };
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    const current = await supabaseFetch('/auth/v1/user', accessToken);
    if (current.ok && current.data?.id) return enforceMfaAssurance(current.data, accessToken);
    if (current.status >= 500) return { user: null, accessToken: null, error: 'The authentication service is temporarily unavailable. Please try again.' };
  }
  if (!refresh || !refreshToken) return { user: null, accessToken: null, error: 'Your session has expired. Please sign in again.' };

  let refreshed;
  try {
    refreshed = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', cache: 'no-store', headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    return { user: null, accessToken: null, error: 'The authentication service is temporarily unavailable. Please try again.' };
  }
  if (refreshed.status >= 500) return { user: null, accessToken: null, error: 'The authentication service is temporarily unavailable. Please try again.' };
  const raw = await refreshed.text();
  let session = null;
  try { session = raw ? JSON.parse(raw) : null; } catch { session = null; }
  if (!refreshed.ok || !session?.access_token || !session?.user?.id) {
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, 'mks_remember_session']) cookieStore.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
    return { user: null, accessToken: null, error: 'Your session has expired. Please sign in again.' };
  }
  setSessionCookies(cookieStore, session);
  return enforceMfaAssurance(session.user, session.access_token);
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, 'mks_remember_session']) cookieStore.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}
