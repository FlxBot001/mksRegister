# Security notes

- Supabase Auth handles passwords; application code does not store password hashes.
- Access and refresh tokens are held in HTTP-only, SameSite=Lax cookies; production cookies are Secure.
- Only the Supabase anon key is used. Never add a service-role key to this app.
- Member API operations verify active tenant membership and permitted role.
- PostgreSQL row-level security provides an independent tenant/role boundary.
- Core member, service, attendance, and membership changes create audit records through database triggers.
- Members use soft deletion; historical attendance references are retained.
- API inputs are validated server-side and upstream error payloads are not returned verbatim.

## Before production

1. Configure and verify authentication rate limits and account recovery.
2. Implement audited invitations and membership administration.
3. Add origin/CSRF checks to state-changing routes and review the final hosting topology.
4. Review audit snapshots for sensitive information and configure retention.
5. Test cross-tenant read/write denial with separate accounts.
6. Verify database backups and restoration.
7. Complete CSP and deployment-specific security-header review.
8. Run lint, build, and integration tests against a configured Supabase project.
