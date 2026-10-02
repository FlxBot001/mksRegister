// Compatibility shim for older imports. Authentication and session storage are MongoDB-native.
export { getAuthContext, clearSessionCookies, SESSION_COOKIE } from '@/lib/auth/server';
