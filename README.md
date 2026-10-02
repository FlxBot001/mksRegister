# MKS Register

MKS Register is a multi-tenant attendance and registration application built on Next.js App Router.

## Current application architecture

- Supabase Auth manages user sign-in and session refresh.
- Supabase tenant memberships remain the authorization source for workspace membership and roles.
- MongoDB stores tenant-scoped members, services, attendance events, invitations, and audit records.
- API handlers check authentication and active workspace membership server-side. MongoDB records are always queried with a `tenant_id` filter.
- MongoDB indexes are created idempotently by the server connection helper.

This is a transitional hybrid architecture: authentication, workspace provisioning, and membership authorization still depend on Supabase. Do not remove the Supabase settings until those responsibilities have been migrated and tested separately.

## Configure locally

1. Copy `.env.example` to `.env.local`.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the existing Auth and tenant-membership integration.
3. Create a MongoDB Atlas cluster and a dedicated database user. Allow network access only from your deployment provider where possible.
4. Set `MONGODB_URI` and `MONGODB_DB_NAME`. URL-encode special characters in the MongoDB username/password.
5. Set `APP_BASE_URL` to the canonical app origin for invitation links.
6. Install dependencies and run `npm run dev`.

Never commit real connection strings, service-role keys, invitation tokens, or administrator passwords. Do not use production data while validating tenant isolation.

## Implemented API surface

All endpoints below require an authenticated user and the relevant active tenant membership. Supply the active workspace ID via `x-tenant-id` or `tenant_id` query/body field as documented by each endpoint.

- `GET/POST /api/v1/members` — tenant-scoped member list and creation.
- `POST /api/v1/import/members` — validate and import up to 1,000 CSV rows.
- `GET/POST /api/v1/services` and `PATCH/DELETE /api/v1/services/:serviceId` — service management.
- `GET/POST /api/v1/attendance` — attendance listing and recording.
- `GET /api/v1/attendance/history?member_id=...` — member attendance history.
- `GET /api/v1/reports/attendance?from=...&to=...` — summary, service, and daily aggregates.
- `GET/POST /api/v1/invitations` — create and list pending invitations.

Attendance statuses are `PRESENT`, `ABSENT`, `LATE`, and `EXCUSED`. Dates are ISO-compatible timestamps. The API caps list and report ranges to avoid unbounded queries.

## Important deployment status

MongoDB integration is implemented in source, but a live connection has not been verified until a valid Atlas URI is supplied to the runtime. Invitation delivery/acceptance, invitation-to-Supabase-membership provisioning, tenant onboarding on a Mongo-only architecture, a first-administrator bootstrap, and complete interactive dashboard screens still require implementation and environment-backed testing. The API foundation must not be described as fully production-ready until those steps, lint/build, authentication, tenant-isolation tests, and database integration tests pass.
