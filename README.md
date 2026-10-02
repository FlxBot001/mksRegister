# MKS Register

MKS Register is a multi-tenant registration and attendance application built with Next.js App Router.

## Architecture

- Supabase Auth manages password verification, sign-in, session refresh, password recovery, and password changes.
- Access/refresh tokens are stored in HTTP-only cookies; dashboard pages verify the session before rendering private content.
- Login attempts are persistently throttled and hashed security events are recorded in MongoDB; account security includes local sign-out and global session-revocation requests.
- Supabase tenant memberships remain the authorization source for workspace membership and roles.
- MongoDB stores tenant-scoped members, services, attendance events, invitations, and audit records.
- Server-side API handlers validate active workspace membership and scope every MongoDB query by tenant_id.
- MongoDB indexes are initialized idempotently by the server connection helper.

This is a transitional hybrid architecture, not a Mongo-only architecture. Authentication, workspace provisioning, and membership authorization still depend on Supabase.

## Local setup

1. Copy .env.example to .env.local.
2. Configure SUPABASE_URL and SUPABASE_ANON_KEY. Configure SUPABASE_SERVICE_ROLE_KEY as a server-only secret for invitation acceptance and one-time administrator provisioning. Never expose it through a NEXT_PUBLIC_ variable.
3. Create a MongoDB Atlas cluster and a dedicated least-privilege database user. Restrict network access to your deployment provider where possible.
4. Set MONGODB_URI and MONGODB_DB_NAME. URL-encode special characters in the MongoDB username/password.
5. Set APP_BASE_URL to the canonical HTTPS app origin for invitation and password-reset links. Add `/reset-password` for that origin to Supabase Auth's allowed redirect URLs and configure the recovery email template/provider.
6. For initial administrator setup, set the ADMIN_* values privately in the execution environment and run npm run bootstrap:admin. The script verifies MongoDB, creates or reuses the Supabase Auth user, creates or resolves the workspace, and grants OWNER membership. Never commit a real administrator password; remove it from the shell after setup.
7. Remove ADMIN_* bootstrap variables from the deployment runtime after provisioning.
8. Run npm install, npm test, npm run lint, and npm run dev.

Never commit real connection strings, service-role keys, invitation tokens, or administrator passwords. Use development data while validating tenant isolation.

## Implemented API surface

All routes require authentication and the relevant active tenant membership. Supply the workspace ID via the x-tenant-id header or tenant_id query/body field as supported by the route.

- GET/POST /api/v1/members — tenant-scoped member list and creation.
- PATCH/DELETE /api/v1/members/:memberId — update or archive a member.
- POST /api/v1/import/members — validate and import up to 1,000 CSV rows.
- GET/POST /api/v1/services and PATCH/DELETE /api/v1/services/:serviceId — service management.
- GET/POST /api/v1/attendance — list and record attendance.
- PATCH /api/v1/attendance/:attendanceId — correct an attendance record with an audit entry.
- GET /api/v1/attendance/history?member_id=... — individual attendance history.
- GET /api/v1/reports/attendance?from=...&to=... — summary, service, and daily aggregates.
- POST /api/v1/auth/login, GET /api/v1/auth/session, POST /api/v1/auth/logout, POST /api/v1/auth/revoke-sessions, POST /api/v1/auth/recover, and POST /api/v1/auth/reset-password — sign-in, session validation, sign-out, global revocation, and password recovery/reset.
- POST /api/v1/auth/mfa-enroll, POST /api/v1/auth/mfa-enroll-verify, GET /api/v1/auth/mfa-factors, POST /api/v1/auth/mfa-unenroll, and POST /api/v1/auth/mfa-verify — TOTP authenticator enrollment, verification, listing/removal, and sign-in challenges.
- GET/POST /api/v1/invitations and POST /api/v1/invitations/accept — create, list, and accept invitations.
- GET/PATCH /api/v1/tenants/:tenantId/memberships — role and membership status administration.

Attendance statuses are PRESENT, ABSENT, LATE, and EXCUSED. Invitation links expire after seven days and must be accepted by a signed-in account whose email matches the invited address. Invitation acceptance requires the server-only Supabase service-role secret. Invitation links can be shared manually; no email delivery provider is configured.

## Authentication behavior and limitations

See [authentication and session lifecycle](docs/security/authentication.md) for cookie lifetimes, login throttling, recovery configuration, global revocation, and operational verification. TOTP multi-factor enrollment, sign-in challenge, and server-side authenticator-assurance enforcement are implemented through Supabase Auth. Provider-wide device-session inventory is not exposed by the current UI; global revocation is available.

## Tests and deployment status

Unit tests cover CSV parsing, including quoted values, embedded line breaks, CRLF, and malformed quoting. CI is configured to run unit tests, lint, and a production build.

MongoDB integration, administrator provisioning, invitation acceptance, and the operations UI have not yet been verified against live services. Existing member records in Supabase are not automatically migrated into MongoDB. Plan and verify any required data migration before switching a live workspace.

Do not describe this system as production-ready until CI succeeds on the latest revision and live tests verify database connectivity, authentication, tenant isolation, role enforcement, imports, attendance integrity, invitation provisioning, backups, and the actual deployment environment.
