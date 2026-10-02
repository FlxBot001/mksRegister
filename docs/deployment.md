# Local setup and deployment

## Requirements

- Node.js compatible with this repository's Next.js 16 project
- Supabase project with Auth and PostgreSQL enabled

## Configure

1. Copy `.env.example` to `.env.local`.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Apply `supabase/migrations/202610020001_initial_tenant_foundation.sql` to a development project first.
4. Create or invite an initial account through Supabase Auth. Public self-service signup is not enabled in this initial slice.
5. Run `npm ci`, `npm run dev`, and open `http://localhost:3000`.

## Quality gate

Run `npm run lint` and `npm run build`. Before production, test login, refresh, logout, workspace creation, member creation, and cross-tenant access denial. Do not enter real member data until these checks pass.

The current repository change is a foundation, not a claim that every MKS Register feature is complete.
