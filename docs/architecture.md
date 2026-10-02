# MKS Register architecture

## Runtime and persistence

MKS Register uses Next.js App Router and MongoDB as its only database. There is no runtime dependency on Supabase Auth, Supabase PostgREST, PostgreSQL, or database triggers. MongoDB stores identity, password hashes, sessions, tenant/workspace documents, memberships, members, services, attendance, invitations, rate-limit buckets, password-reset tokens, MFA challenges, and audit/security events.

Authentication is implemented in application code: scrypt password hashes, random opaque session tokens, hashed session tokens at rest, expiring MongoDB session records, optional TOTP MFA, and single-use password-reset tokens. TOTP secrets are encrypted with `AUTH_ENCRYPTION_KEY`.

## Tenant model

- A tenant is one church or organization.
- A user may belong to multiple tenants through MongoDB `memberships` documents.
- Every tenant-owned operational record has a non-null string `tenant_id` matching the tenant ObjectId string.
- User and membership identifiers are MongoDB ObjectIds; tenant IDs are stored as strings on tenant-owned records.
- API handlers verify an active membership and role before access, and scope operational queries by `tenant_id`.
- MongoDB unique and query indexes are initialized by `src/lib/mongodb/server.js`.
- Workspace creation inserts the tenant and initial OWNER membership; if membership creation fails, the new tenant is rolled back.

## Main collections

`users`, `sessions`, `tenants`, `memberships`, `members`, `services`, `attendance`, `invitations`, `audit_logs`, `auth_security_events`, `auth_rate_limits`, `password_resets`, and `mfa_challenges`.

## Implemented workflows

Account registration and sign-in, session validation and revocation, password change/recovery, TOTP enrollment and sign-in challenge, workspace creation/listing, role administration, tenant-scoped member management/import, service management, attendance recording/correction/history, invitations, and attendance reports have API and UI implementations. These workflows still require a passing CI build and live integration tests against a configured MongoDB deployment before they can be treated as production verified.

## Migration boundary

No runtime code reads the former Supabase/PostgreSQL database. Existing users, memberships, and operational records from a former deployment are not automatically migrated. Export and validate the source data, map IDs and tenant references to the MongoDB schema, and test counts, unique constraints, attendance history, and tenant isolation before cutover. Do not switch an active workspace without a verified backup and rollback plan.
