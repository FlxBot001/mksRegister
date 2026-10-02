import 'server-only';

import { createHmac } from 'node:crypto';
import { getDatabase } from '@/lib/mongodb/server';
import { isLoginThrottled, LOGIN_WINDOW_MS, loginRetryAfterSeconds } from '@/lib/auth/policy.mjs';

function digest(value) {
  const key = process.env.AUTH_AUDIT_HASH_SECRET?.trim();
  if (!key || key.length < 32) throw new Error('AUTH_AUDIT_HASH_SECRET must be configured with at least 32 characters.');
  return createHmac('sha256', key).update(String(value || '')).digest('hex');
}

function getClientAddress(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const candidate = (forwarded || real || 'unknown').split(',')[0].trim();
  return candidate.slice(0, 100) || 'unknown';
}

export async function beginLoginAttempt(request, email) {
  const db = await getDatabase();
  const now = Date.now();
  const bucket = Math.floor(now / LOGIN_WINDOW_MS);
  const expiresAt = new Date((bucket + 2) * LOGIN_WINDOW_MS);
  const emailKey = `email:${digest(String(email || '').trim().toLowerCase())}:${bucket}`;
  const ipKey = `ip:${digest(getClientAddress(request))}:${bucket}`;

  const increment = async (key) => db.collection('auth_rate_limits').findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt, created_at: new Date(now) } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: false },
  );

  const [emailWindow, ipWindow] = await Promise.all([increment(emailKey), increment(ipKey)]);
  const limited = isLoginThrottled(emailWindow.count, ipWindow.count);
  if (limited) {
    await recordLoginAttempt(request, email, { success: false, reason: 'rate_limited' });
    return { limited: true, retryAfter: loginRetryAfterSeconds(now) };
  }
  return { limited: false };
}

export async function recordLoginAttempt(request, email, { success, reason, userId, eventType } = {}) {
  const db = await getDatabase();
  const address = getClientAddress(request);
  await db.collection('auth_security_events').insertOne({
    event_type: eventType || (success ? 'login_succeeded' : 'login_failed'),
    email_hash: digest(String(email || '').trim().toLowerCase()),
    user_id: typeof userId === 'string' ? userId : null,
    ip_hash: digest(address),
    user_agent: (request.headers.get('user-agent') || '').slice(0, 500),
    reason: String(reason || (success ? 'authenticated' : 'invalid_credentials')).slice(0, 80),
    created_at: new Date(),
  });
}
