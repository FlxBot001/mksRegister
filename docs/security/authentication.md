# Authentication and session lifecycle

## Provider and secrets

MKS Register delegates password verification, account identity, recovery-email delivery, and refresh-token rotation to Supabase Auth. The browser never receives the Supabase service-role key or database credentials. Runtime configuration requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MONGODB_URI`, and `MONGODB_DB_NAME`.

Set `APP_BASE_URL` to the canonical HTTPS application origin. In Supabase Auth settings, add `/reset-password` on that origin to the allowed redirect URLs and configure the recovery email template/provider. Password recovery cannot deliver mail until the provider and sender settings are configured.

## Sign-in

- `POST /api/v1/auth/login` validates the request and delegates password verification to Supabase Auth.
- The response stores access and refresh tokens in `HttpOnly`, `SameSite=Lax` cookies. Cookies use `Secure` in production.
- The optional “Keep me signed in” choice controls the refresh-cookie lifetime: 8 hours when off, 30 days when on. Access-token lifetime follows the provider response.
- A successful sign-in is not issued if the persistent security event cannot be recorded.
- Error responses do not distinguish unknown accounts from incorrect passwords.

## Login throttling and security events

Login attempts use MongoDB's `auth_rate_limits` collection with atomic increments in 15-minute buckets. The current policy allows up to 5 attempts per normalized email hash and 20 attempts per client-address hash per bucket. Exceeding either limit returns HTTP 429 and a `Retry-After` header. Bucket documents expire through a TTL index.

The `auth_security_events` collection records success/failure, timestamp, user ID where available, reason, a keyed HMAC-SHA-256 hash of the normalized email, a keyed HMAC-SHA-256 hash of the client address, and a bounded user-agent string. Set `AUTH_AUDIT_HASH_SECRET` to a cryptographically random value of at least 32 characters; login is fail-closed if this key is missing or too short. Raw passwords, access tokens, refresh tokens, email addresses, and raw IP addresses are not stored in these records. Configure and review retention for security events under the organization's approved retention policy; this code does not invent a legal retention period.

The address used for throttling is derived from `x-forwarded-for` or `x-real-ip`. Production ingress must normalize/overwrite forwarding headers and prevent direct access that would allow clients to spoof them.

## Session refresh, sign-out, and revocation

- `GET /api/v1/auth/session` validates the current Supabase identity.
- Server-side API handlers use the refreshed access token and independently enforce tenant membership/role checks.
- Expired access tokens are refreshed using the server-only refresh cookie. Failed refresh clears the session cookies.
- `POST /api/v1/auth/logout` asks Supabase Auth to end the current session and clears local cookies.
- `POST /api/v1/auth/revoke-sessions` requests global session sign-out from Supabase Auth and clears local cookies.
- `/dashboard` routes are gated by a session-verification UI guard. API authorization remains mandatory; the UI guard is not a security boundary.

The current provider integration does not enumerate every device session in the UI. The security page therefore displays the currently verified account and provides a global revocation action without fabricating a session inventory.

## Password recovery

- `POST /api/v1/auth/recover` delegates recovery email delivery to Supabase Auth and always returns a generic confirmation to avoid account enumeration.
- The recovery email must redirect to `/reset-password` on the configured application origin.
- The reset page accepts the short-lived recovery session from the provider redirect, strips tokens from the visible URL, validates password confirmation in the UI, and submits the password change server-side.
- Password reset requires at least 12 characters in the application UI/API. Confirm that the Supabase project's password policy is at least as strict as the application policy.

## Limitations and operational verification

This integration is provider-backed, not a custom password database; password hashing is performed by Supabase Auth. MFA is not yet exposed as an interactive enrollment/challenge flow. Account disablement should be performed through the provider's administrative account controls and/or by changing the user's active tenant memberships; all operational APIs must continue to deny inactive memberships.

Before production use, verify:
1. Supabase email confirmation and recovery settings.
2. Allowed redirect URLs for each deployment origin.
3. Login throttling and event persistence against the configured MongoDB database.
4. Cookie behavior over HTTPS and across refresh/expiry.
5. Local logout and global revocation with real test accounts.
6. Password recovery end-to-end from email link through successful sign-in.
7. TOTP enrollment, wrong-code handling, sign-in challenge, assurance enforcement, and factor removal.
8. Disabled/suspended membership denial across every protected API.
9. Security-event access restrictions and retention under the approved policy.
