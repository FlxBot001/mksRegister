# MKS Register

MKS Register is a church registration and attendance management platform built on the existing Next.js App Router project using JavaScript/JSX and Tailwind CSS.

## Current foundation

- Responsive public landing page and sign-in page
- Supabase Auth sign-in, sign-out, HTTP-only session cookies, and refresh-token handling
- Multi-tenant workspace creation and listing
- Tenant-scoped member directory with server-side role checks
- PostgreSQL row-level security and audit triggers for core records
- Initial relational schema for members, services, attendance, memberships, and audit logs

Service and attendance user workflows, member editing, invitations, imports, reports, analytics, QR check-in, and AI workflows are not yet complete. They should be implemented as connected UI/API/database slices rather than mock screens.

## Setup

See [deployment](docs/deployment.md), [architecture](docs/architecture.md), and [security](docs/security.md).

1. Copy `.env.example` to `.env.local`.
2. Configure Supabase URL and anon key.
3. Apply `supabase/migrations/202610020001_initial_tenant_foundation.sql` to a development project.
4. Create or invite an initial user in Supabase Auth.
5. Run `npm ci`, `npm run dev`, and open `http://localhost:3000`.

Do not treat this foundation as production-ready until lint, production build, authentication, tenant-isolation, authorization, and data-integrity tests pass against a configured Supabase environment.
