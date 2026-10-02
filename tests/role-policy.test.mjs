import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionRoles, roleHasPermission, ROLE_NAMES } from '../src/lib/auth/role-policy.mjs';

test('workspace owners and administrators can manage roles', () => {
  assert.equal(roleHasPermission('OWNER', 'roles.manage'), true);
  assert.equal(roleHasPermission('ADMIN', 'roles.manage'), true);
  assert.equal(roleHasPermission('MANAGER', 'roles.manage'), false);
});

test('report viewers can read reports but not raw member or attendance records', () => {
  assert.equal(roleHasPermission('REPORT_VIEWER', 'reports.read'), true);
  assert.equal(roleHasPermission('REPORT_VIEWER', 'members.read'), false);
  assert.equal(roleHasPermission('REPORT_VIEWER', 'attendance.read'), false);
});

test('registrars can manage members and record attendance but cannot administer roles', () => {
  assert.equal(roleHasPermission('REGISTRAR', 'members.read'), true);
  assert.equal(roleHasPermission('REGISTRAR', 'members.create'), true);
  assert.equal(roleHasPermission('REGISTRAR', 'attendance.create'), true);
  assert.equal(roleHasPermission('REGISTRAR', 'roles.manage'), false);
});

test('member and volunteer roles do not inherit staff directory or reporting access', () => {
  for (const role of ['MEMBER', 'VOLUNTEER']) {
    assert.equal(roleHasPermission(role, 'members.read'), false);
    assert.equal(roleHasPermission(role, 'attendance.read'), false);
    assert.equal(roleHasPermission(role, 'reports.read'), false);
  }
});

test('assignable role names are explicit and do not include platform super-admin', () => {
  assert.equal(ROLE_NAMES.includes('MANAGEMENT'), true);
  assert.equal(ROLE_NAMES.includes('COMMUNICATIONS'), true);
  assert.equal(ROLE_NAMES.includes('SUPER_ADMIN'), false);
  assert.equal(permissionRoles('unknown.permission').length, 0);
});
