# Local setup and deployment

## Requirements

- Node.js 22 (CI target)
- MongoDB Atlas or a reachable MongoDB replica set
- Supabase project with Auth and PostgreSQL enabled for sign-in, tenants, and membership roles
- A Next.js-compatible hosting provider

## Configure

1. Copy .env.example to .env.local.
2. Set SUPABASE_URL and SUPABASE_ANON_KEY for the existing authentication and tenant membership services.
3. Set SUPABASE_SERVICE_ROLE_KEY as a server-only secret. It is required for invitation acceptance and the one-time administrator bootstrap. Never expose it to browser code.
4. Create a MongoDB Atlas database user with least-privilege access to the application database. Restrict the network access list to the deployment provider and local development IPs needed for testing.
5. Set MONGODB_URI, MONGODB_DB_NAME, and MONGODB_MAX_POOL_SIZE. URL-encode special characters in the URI credentials.
6. Set APP_BASE_URL to the canonical HTTPS application origin.
7. Provision the first administrator once: supply ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME, ADMIN_TENANT_NAME, and ADMIN_TENANT_SLUG privately to the shell or a temporary secret context, then run npm run bootstrap:admin. The script pings MongoDB, creates or reuses the Supabase Auth user, creates or resolves the workspace, and assigns OWNER membership. Do not commit these values or keep the bootstrap password in the long-running deployment environment.
8. Run npm install, npm test, npm run lint, and npm run build.

## Deployment secrets

Configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MONGODB_URI, MONGODB_DB_NAME, and APP_BASE_URL as server environment variables in the hosting provider. Keep the service-role key and MongoDB URI server-side; do not prefix them with NEXT_PUBLIC_. Do not deploy real member data until a production backup and restore procedure is in place.

No AppDeploy application is currently registered for this repository, so this document does not claim a live deployment URL or configured production secrets.

## Verification checklist

- Unit tests, lint, and production build pass on the exact deployed commit.
- Login, refresh, logout, and workspace membership checks work against the configured Supabase project.
- MongoDB connection, indexes, create/update/archive, and duplicate constraints work against a non-production Atlas database.
- Cross-tenant access attempts are denied for every API route.
- Attendance uniqueness, corrections, history, reports, imports, and role changes are verified.
- Invitation links expire, reject mismatched email addresses, and provision membership only when the service-role secret is configured.
- Verify backups, restore, logging, monitoring, rate limits, retention, and privacy requirements before production use.

This remains a hybrid architecture: MongoDB stores operational records, while Supabase Auth and tenant memberships remain authoritative. Existing Supabase member records are not automatically migrated to MongoDB.
