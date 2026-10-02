# Security notes

- MongoDB is the only persistence layer, including identity, password hashes, sessions, memberships, operational records, and audit/security events.
- Passwords use scrypt with per-password random salts. Session tokens are random opaque values; only hashes are stored in MongoDB.
- Session cookies are HTTP-only, SameSite=Lax, and Secure in production. Sessions expire and can be revoked individually or account-wide.
- TOTP MFA secrets are encrypted at rest. Configure and back up `AUTH_ENCRYPTION_KEY`; configure `AUTH_AUDIT_HASH_SECRET` for keyed security-event and throttling hashes.
- Protected API operations verify active tenant membership, apply role policies, and scope MongoDB queries by tenant.
- Member records use soft deletion and historical attendance references are retained.
- Invitations store token hashes and expire; password-reset tokens are single-use and time-limited.
- Inputs are validated server-side and upstream database details are not returned verbatim.
- Application audit records are written to MongoDB; the current design does not rely on SQL triggers or row-level security.

## Before production

1. Configure MongoDB network restrictions, least-privilege database credentials, backup, and restore.
2. Configure recovery email delivery and verify recovery end-to-end. Email verification, MFA recovery codes, passkeys, and administrator-initiated password resets are not yet implemented.
3. Add and test explicit Origin/CSRF protections for state-changing routes against the final hosting topology.
4. Review audit snapshots for sensitive information and configure retention.
5. Test cross-tenant read/write denial with separate accounts and every role.
6. Verify session expiry, individual revocation, account-wide revocation, password change, MFA enrollment/challenge/removal, and reset-token single-use.
7. Complete CSP and deployment-specific security-header review.
8. Run unit tests, lint, production build, and integration tests against the exact deployed commit.
9. Validate a migration and rollback plan before moving existing production data into MongoDB.

The repository code has not been verified against a live MongoDB deployment yet. Do not treat documentation or the existence of an endpoint as evidence that production integration tests have passed.
