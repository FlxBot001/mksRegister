import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, encryptSecret, decryptSecret, generateTotpSecret, verifyTotp, totpUri, sha256 } from '../src/lib/auth/credentials.mjs';

test('scrypt password hashes verify only the matching password', async () => {
  const encoded = await hashPassword('A-long-strong-password-123!');
  assert.match(encoded, /^scrypt:/);
  assert.equal(await verifyPassword('A-long-strong-password-123!', encoded), true);
  assert.equal(await verifyPassword('wrong-password', encoded), false);
  assert.equal(await verifyPassword('A-long-strong-password-123!', 'invalid'), false);
});

test('TOTP secrets are random, and the RFC 6238 SHA-1 test vector verifies', () => {
  const first = generateTotpSecret();
  const second = generateTotpSecret();
  assert.match(first, /^[A-Z2-7]+$/);
  assert.notEqual(first, second);
  assert.equal(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59000), true);
  assert.equal(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '000000', 59000), false);
  assert.match(totpUri(first, 'person@example.com'), /^otpauth:\/\/totp\//);
});

test('TOTP secrets are encrypted at rest and cannot be read without the configured key', () => {
  process.env.AUTH_ENCRYPTION_KEY = 'test-only-encryption-key-that-is-long-enough';
  const secret = 'JBSWY3DPEHPK3PXP';
  const encrypted = encryptSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(decryptSecret(encrypted), secret);
  process.env.AUTH_ENCRYPTION_KEY = 'a-different-test-key-that-is-long-enough';
  assert.throws(() => decryptSecret(encrypted));
  process.env.AUTH_ENCRYPTION_KEY = 'test-only-encryption-key-that-is-long-enough';
});

test('security token hashing is deterministic without storing the original token', () => {
  assert.equal(sha256('token-value'), sha256('token-value'));
  assert.notEqual(sha256('token-value'), 'token-value');
});
