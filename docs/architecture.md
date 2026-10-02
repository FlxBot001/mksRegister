# MKS Register architecture

## Initial foundation

The existing Next.js App Router application remains JavaScript/JSX. Supabase Auth provides identity and token lifecycle; Supabase PostgREST provides database access. Access and refresh tokens are stored in HTTP-only cookies. The app does not use a service-role key.

## Tenant model

- A tenant is one church or organization.
- A user may belong to multiple tenants through `tenant_memberships`.
- Every tenant-owned record has a non-null `tenant_id`.
- API handlers verify active membership before tenant-scoped access.
- PostgreSQL row-level security independently checks tenant membership and role.
- Tenant creation uses one database function to create the tenant and its initial OWNER membership together.

## Initial tables

`profiles`, `tenants`, `tenant_memberships`, `members`, `services`, `attendance_records`, and `audit_logs`. The migration defines relational constraints, indexes, role checks, RLS policies, tenant creation, and audit triggers. Extend these tables as features are built; do not bypass tenant boundaries.

## Implemented vertical slice

Sign-in, sign-out, session refresh, workspace creation/listing, and tenant-scoped member listing/creation are implemented in the initial slice. Services and attendance have database tables and policies, but their UI/API workflows are not yet complete. Member editing, invitations, imports, reports, analytics, QR check-in, and AI features are future phases.

## Operational boundaries

Provision initial users through Supabase Auth until the application has an audited invitation workflow. Apply migrations to a development project first and verify access with multiple users across multiple tenants before adding real member information.
