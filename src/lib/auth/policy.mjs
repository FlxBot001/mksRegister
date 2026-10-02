export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_EMAIL_LIMIT = 5;
export const LOGIN_IP_LIMIT = 20;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidNewPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 1024;
}

export function isLoginThrottled(emailCount, ipCount) {
  return emailCount > LOGIN_EMAIL_LIMIT || ipCount > LOGIN_IP_LIMIT;
}

export function loginRetryAfterSeconds(now) {
  const bucket = Math.floor(now / LOGIN_WINDOW_MS);
  return Math.max(1, Math.ceil(((bucket + 1) * LOGIN_WINDOW_MS - now) / 1000));
}
