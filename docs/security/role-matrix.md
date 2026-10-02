# Workspace role and permission matrix

This matrix describes the current server-side policy in `src/lib/auth/role-policy.mjs`. UI visibility mirrors these checks, but API authorization is authoritative.

| Workspace role | Member directory | Record attendance | Read raw attendance | Read attendance reports | Manage services | Invite users | Manage roles |
|---|---:|---:|---:|---:|---:|---:|---:|
| OWNER | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| ADMIN | Yes | Yes | Yes | Yes | Yes | Yes | Yes, with protected-role limits |
| MANAGER | Yes | Yes | Yes | Yes | Yes | Yes | No |
| MANAGEMENT | Yes | Yes | Yes | Yes | Yes | No | No |
| PASTOR | Yes | No | Yes | Yes | No | No | No |
| REGISTRAR | Yes | Yes | Yes | Yes | No | No | No |
| ATTENDANCE_OFFICER | Yes | Yes | Yes | Yes | No | No | No |
| REPORT_VIEWER | No | No | No | Yes | No | No | No |
| MINISTRY_LEADER | Restricted pending scoped access | No | No | No | No | No | No |
| GROUP_LEADER | Restricted pending scoped access | No | No | No | No | No | No |
| COMMUNICATIONS | Restricted pending field-limited contact access | No | No | No | No | No | No |
| VOLUNTEER | No | No | No | No | No | No | No |
| MEMBER | No | No | No | No | No | No | No |

## Protected role assignment

- Only an active workspace OWNER or ADMIN may manage workspace memberships.
- Only OWNER may assign OWNER, ADMIN, or MANAGEMENT.
- ADMIN cannot modify an OWNER's role or status.
- The API prevents suspending/removing the last active OWNER and prevents a user from suspending/removing their own active membership.
- Invitations cannot grant OWNER. Only OWNER may invite ADMIN or MANAGEMENT.

## Scope limitations

Attribute-based access control (ABAC) for ministry, group, branch/location, and resource ownership is not yet implemented. Ministry/group leaders are therefore deliberately denied tenant-wide member, raw attendance, and report access rather than receiving unrestricted records. The communications role is also denied the full member directory until a contact-only projection and purpose-limited API are implemented.

`SUPER_ADMIN` is a reserved platform-level concept and is not assignable through tenant membership APIs. There is no platform-wide super-admin console yet.

Members and volunteers do not yet have a self-service member-profile route; their sign-in does not imply permission to browse church records. Extend this matrix and its automated tests whenever a new role or data scope is introduced.
