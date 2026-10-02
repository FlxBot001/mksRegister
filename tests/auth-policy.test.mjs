import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLoginThrottled,
  isValidEmail,
  isValidNewPassword,
  loginRetryAfterSeconds,
  normalizeEmail,
  LOGIN_WINDOW_MS,
} from '../src/lib/auth/policy.mjs';

test('normalizes email addresses without accepting malformed values', () => {
  assert.equal(normalizeEmail('  FELIX@Example.org  '), 'felix@example.org');
  assert.equal(normalizeEmail(null), '');
  assert.equal(isValidEmail('  FELIX@Example.org  '), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isValidEmail(`a${'x'.repeat(250)}@example.org`), false);
});

test('requires reset passwords to be between 12 and 1024 characters', () => {
  assert.equal(isValidNewPassword('short'), false);
  assert.equal(isValidNewPassword('long-enough-password'), true);
  assert.equal(isValidNewPassword('x'.repeat(1025)), false);
  assert.equal(isValidNewPassword(null), false);
});

test('throttles when either the email or client address limit is exceeded', () => {
  assert.equal(isLoginThrottled(5, 20), false);
  assert.equal(isLoginThrottled(6, 1), true);
  assert.equal(isLoginThrottled(1, 21), true);
});

test('returns a positive retry interval until the next 15-minute bucket', () => {
  assert.equal(loginRetryAfterSeconds(0), 900);
  assert.equal(loginRetryAfterSeconds(1000), 899);
  assert.equal(loginRetryAfterSeconds(LOGIN_WINDOW_MS), 900);
});
