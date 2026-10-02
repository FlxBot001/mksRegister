# Authentication and session lifecycle

## Storage and secrets

MKS Register stores identity, password hashes, sessions, MFA settings, reset tokens, memberships, and audit/security events in MongoDB. Passwords use Node.js scrypt with per-password random salts. Session cookies contain random opaque tokens; only SHA-256 hashes of those tokens are stored in MongoDB.

Required server-side configuration:
- `MONGODB_URI` and `MONGODB_DB_NAME`
- `AUTH_ENCRYPTION_KEY`: at least 32 characters, used to encrypt TOTP secrets at rest.
- `AUTH_AUDIT_HASH_SECRET`: at least 32 characters, used for keyed hashes in security events and throttling buckets.
- `APP_BASE_URL`: canonical app origin used in recovery links.

Optional recovery email delivery uses `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM`. Without these settings, recovery requests still receive a generic response but no email is delivered. Do not represent email recovery as operational until end-to-end delivery is tested.

## Sign-in and sessions

- `POST /api/v1/auth/register` validates name/email/password, stores a scrypt password hash, and creates a session.
- `POST /api/v1/auth/login` validates credentials against the MongoDB users collection.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- The optional “Keep me signed in” choice sets an eight-hour session or a session lasting up to 30 days.
- `GET /api/v1/auth/session` checks the opaque session token against MongoDB, verifies account status and expiry, and returns a safe user projection.
- `GET /api/v1/auth/sessions` lists active sessions for the signed-in account without exposing token hashes or IP hashes.
- `POST /api/v1/auth/revoke-session` revokes one selected session; revoking the current session clears its cookie.
- `POST /api/v1/auth/change-password` verifies the current password, stores a new scrypt hash, and revokes all other sessions.
- `POST /api/v1/auth/logout` revokes the current session and clears cookies.
- `POST /api/v1/auth/revoke-sessions` revokes every active session for the account.
- Session tokens are not returned in API JSON and are never stored in plaintext in MongoDB.

## Login throttling and security events

Login attempts use MongoDB's `auth_rate_limits` collection with atomic increments in time buckets. The current policy allows up to five attempts per normalized email hash and twenty attempts per client-address hash per bucket. Exceeding either limit returns HTTP 429 and a `Retry-After` header. Bucket documents expire through a TTL index.

The `auth_security_events` collection records event type, timestamp, user ID where available, reason, keyed HMAC-SHA-256 hashes of normalized email and client address, and a bounded user-agent string. Raw passwords, session tokens, email addresses, and raw IP addresses are not stored in these records. Configure retention according to the organization's approved policy; this code does not invent a legal retention period.

The address used for throttling is derived from `x-forwarded-for` or `x-real-ip`. Production ingress must normalize/overwrite forwarding headers and prevent direct access that would allow clients to spoof them.

## MFA

- `POST /api/v1/auth/mfa-enroll` creates a TOTP secret and QR code.
- `POST /api/v1/auth/mfa-enroll-verify` verifies the code before enabling MFA.
- `POST /api/v1/auth/mfa-verify` completes the login challenge after password verification.
- `GET /api/v1/auth/mfa-factors` lists whether an authenticator is configured.
- `POST /api/v1/auth/mfa-unenroll` requires a current TOTP code to disable MFA.

TOTP secrets are encrypted at rest using `AUTH_ENCRYPTION_KEY`. Back up this key securely and rotate it only with a planned re-encryption migration. The app should deny protected access when an account has MFA enabled but the current session has not completed the MFA challenge.

## Password recovery

- `POST /api/v1/auth/recover` creates a random single-use token whose hash is stored in MongoDB with a 30-minute expiry. The response is generic to avoid account enumeration.
- When configured, Resend delivers a link to `/reset-password?token=...`.
- `POST /api/v1/auth/reset-password` validates the token, applies the password policy, marks the token used, and revokes active sessions.
- The application requires passwords of at least 12 characters.

## Operational verification and limitations

Before production use, verify:
1. Password hashing and wrong-password handling against test accounts.
2. Cookie behavior over HTTPS and across expiry.
3. Local logout and account-wide revocation with multiple sessions.
4. TOTP enrollment, QR scanning, wrong-code handling, login challenge, and factor removal.
5. Recovery email delivery, token expiry/single-use, password reset, and session revocation.
6. Login throttling and event persistence in MongoDB.
7. Disabled/suspended account and membership denial across every protected API.
8. Security-event access restrictions, backup/restore, retention, and incident response.

MFA recovery codes, passkeys, email verification, and administrator-initiated password resets are not yet implemented. Account registration is available, so configure verification and abuse protections before accepting unrestricted public signups in production.
