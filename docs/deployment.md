# Local setup and deployment

## Requirements

- Node.js 22 or newer
- MongoDB Atlas or a secured MongoDB deployment
- A Next.js-compatible hosting provider
- Optional: Resend account and verified sender for password-reset email delivery

MongoDB is the only database and identity store used by the application. Supabase, PostgreSQL, and provider-managed authentication are not required.

## Configure

1. Copy `.env.example` to `.env.local`.
2. Create a MongoDB database and a dedicated application user with least-privilege access. Restrict network access to the deployment provider and necessary development IPs.
3. Set `MONGODB_URI`, `MONGODB_DB_NAME`, and `MONGODB_MAX_POOL_SIZE`. URL-encode special characters in URI credentials.
4. Generate independent, cryptographically random secrets of at least 32 characters for `AUTH_ENCRYPTION_KEY` and `AUTH_AUDIT_HASH_SECRET`. Keep them in the host's secret manager; do not expose them to browser code. Back up `AUTH_ENCRYPTION_KEY` securely because it encrypts MFA secrets.
5. Set `APP_BASE_URL` to the canonical HTTPS application origin.
6. To enable password recovery email, configure `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM` sender. Without these, no recovery email can be delivered.
7. Provision the first administrator once: provide `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, `ADMIN_TENANT_NAME`, and `ADMIN_TENANT_SLUG` privately to the shell or a temporary secret context, then run `npm run bootstrap:admin`. The script creates/reuses the MongoDB user, workspace, and OWNER membership. Do not commit or retain the bootstrap password in the long-running deployment environment.
8. Run `npm install`, `npm test`, `npm run lint`, and `npm run build`.

## Deployment secrets

Configure `MONGODB_URI`, `MONGODB_DB_NAME`, `AUTH_ENCRYPTION_KEY`, `AUTH_AUDIT_HASH_SECRET`, and `APP_BASE_URL` as server-side environment variables. Configure `RESEND_API_KEY` and `AUTH_EMAIL_FROM` if recovery email is required. Never prefix database credentials or secrets with `NEXT_PUBLIC_`.

No AppDeploy application target is currently registered for this repository, so this document does not claim a live deployment URL or configured production secrets.

## Readiness endpoint

`GET /api/health` checks MongoDB connectivity, the MFA encryption key, and the authentication audit hash secret. It reports whether recovery email delivery is configured without exposing credentials.

## Verification checklist

- Unit tests, lint, and production build pass on the exact deployed commit.
- Account registration, password hashing, sign-in, session expiry, local logout, and global revocation work with MongoDB.
- TOTP enrollment, invalid-code handling, sign-in challenge, secret encryption, and factor removal work.
- Password recovery sends an email from the verified sender, tokens expire and are single-use, and password reset revokes active sessions.
- MongoDB indexes, create/update/archive, unique constraints, backups, and restore work against a non-production database.
- Cross-tenant access attempts are denied for every protected API.
- Attendance uniqueness, corrections, history, reports, CSV imports, invitation expiry, email matching, and role changes are verified.
- Logging, monitoring, rate limits, retention, privacy, and incident response have been reviewed before production use.

MongoDB-only operation is implemented in the application code, but deployment and live service verification remain separate steps. Existing records from a former database are not automatically migrated; plan and validate a one-time migration before switching a live workspace.
