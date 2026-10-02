const POLICY = Object.freeze({
  'members.read': ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'COMMUNICATIONS'],
  'members.create': ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'REGISTRAR'],
  'members.update': ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'REGISTRAR'],
  'attendance.read': ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER'],
  'attendance.create': ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'REGISTRAR', 'ATTENDANCE_OFFICER'],
  'reports.read': ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER', 'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'REPORT_VIEWER'],
  'services.manage': ['OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT'],
  'invitations.manage': ['OWNER', 'ADMIN', 'MANAGER'],
  'roles.manage': ['OWNER', 'ADMIN'],
});

export const ROLE_NAMES = Object.freeze([
  'OWNER', 'ADMIN', 'MANAGER', 'MANAGEMENT', 'PASTOR', 'MINISTRY_LEADER',
  'GROUP_LEADER', 'REGISTRAR', 'ATTENDANCE_OFFICER', 'COMMUNICATIONS',
  'REPORT_VIEWER', 'VOLUNTEER', 'MEMBER',
]);

export function roleHasPermission(role, permission) {
  return Boolean(typeof role === 'string' && POLICY[permission]?.includes(role));
}

export function permissionRoles(permission) {
  return [...(POLICY[permission] || [])];
}
