# MKS Register

MKS Register is a multi-tenant church registration, member directory, service, and attendance platform built with Next.js App Router. **MongoDB is the only database used by the application**, including accounts, password hashes, sessions, workspace records, memberships, operational data, and audit/security events.

## Architecture

- MongoDB is the sole persistence layer. The application does not require Supabase, PostgreSQL, or another identity database.
- Passwords are hashed with Node.js scrypt; session cookies are opaque, random, HTTP-only tokens whose hashes are stored in MongoDB.
- Sessions support expiry, local sign-out, and account-wide revocation. MFA uses TOTP with encrypted secrets at rest.
- Password recovery stores single-use, expiring token hashes. Email delivery is optional and uses Resend when configured.
- Tenant memberships and role policy are stored and enforced in MongoDB. Every protected operational API validates active membership and tenant-scopes its queries.
- Members, services, attendance, invitations, audit events, rate-limit buckets, MFA challenges, and password reset records are stored in MongoDB.
- MongoDB indexes are initialized by the server connection helper. Configure a dedicated least-privilege database user and network allowlist.

## Local setup

1. Use Node.js 22 or newer and copy `.env.example` to `.env.local`.
2. Configure `MONGODB_URI` and `MONGODB_DB_NAME`. URL-encode special characters in credentials and restrict database network access.
3. Generate independent random values of at least 32 characters for `AUTH_ENCRYPTION_KEY` and `AUTH_AUDIT_HASH_SECRET`. Keep them server-side and back them up securely; losing the encryption key prevents existing MFA secrets from being decrypted.
4. Set `APP_BASE_URL` to the canonical app origin. For password-reset email delivery, configure `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM` sender.
5. Provision the initial administrator privately with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, `ADMIN_TENANT_NAME`, and `ADMIN_TENANT_SLUG`, then run `npm run bootstrap:admin`. Remove bootstrap variables after use.
6. Run `npm install`, `npm test`, `npm run lint`, `npm run build`, and `npm run dev`.

Never commit connection strings, passwords, reset tokens, session tokens, or encryption secrets. Use test data until tenant isolation and backup/restore have been verified.

## Main API surface

All operational routes require an authenticated MongoDB session and the relevant active workspace membership. Supply the workspace ID through the `x-tenant-id` header or `tenant_id` query/body field as supported.

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, `GET /api/v1/auth/sessions`, `POST /api/v1/auth/change-password`, `POST /api/v1/auth/revoke-session`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/revoke-sessions`.
- `POST /api/v1/auth/recover`, `POST /api/v1/auth/reset-password`.
- `POST /api/v1/auth/mfa-enroll`, `POST /api/v1/auth/mfa-enroll-verify`, `GET /api/v1/auth/mfa-factors`, `POST /api/v1/auth/mfa-unenroll`, `POST /api/v1/auth/mfa-verify`.
- `GET/POST /api/v1/tenants` — list workspaces and create a workspace with OWNER membership.
- `GET/POST /api/v1/members`, `PATCH/DELETE /api/v1/members/:memberId`, `POST /api/v1/import/members`.
- `GET/POST /api/v1/services`, `PATCH/DELETE /api/v1/services/:serviceId`.
- `GET/POST /api/v1/attendance`, `PATCH /api/v1/attendance/:attendanceId`, `GET /api/v1/attendance/history?member_id=...`.
- `GET /api/v1/reports/attendance?from=...&to=...`.
- `GET/POST /api/v1/invitations`, `POST /api/v1/invitations/accept`.
- `GET/PATCH /api/v1/tenants/:tenantId/memberships`.
- `GET /api/health` — readiness check for MongoDB and required security configuration.

Attendance statuses are `PRESENT`, `ABSENT`, `LATE`, and `EXCUSED`. Invitation links expire after seven days and can be accepted only by a signed-in account with the invited email. Password recovery emails require the optional Resend configuration. Without a configured email provider, the UI keeps a generic response but email delivery will not occur.

## Authorization

The [workspace role matrix](docs/security/role-matrix.md) documents current least-privilege permissions. Ministry/group leaders and communications roles remain restricted from broad church-wide records until attribute-based access control and field-limited contact projections are implemented.

## Tests and deployment status

CI is configured to run unit tests, lint, and a production build. Do not describe this system as production-ready until the latest commit passes CI and live checks verify MongoDB connectivity, password/session flows, MFA, recovery email delivery, tenant isolation, permissions, imports, attendance integrity, invitation acceptance, backups, restore, and deployment secrets.

No live deployment or production database has been configured by these repository changes. Existing records in the former Supabase/PostgreSQL setup are not automatically migrated; plan and validate a one-time migration before switching an existing live workspace to MongoDB-only operation.
