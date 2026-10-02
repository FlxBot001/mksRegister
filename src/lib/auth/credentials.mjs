import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt.toString('base64url')}:${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'base64url');
    const expected = Buffer.from(parts[2], 'base64url');
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = Buffer.from(await scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let result = '';
  for (let i = 0; i < bits.length; i += 5) result += alphabet[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return result;
}

export function verifyTotp(secret, token, now = Date.now()) {
  if (!/^\d{6}$/.test(String(token || ''))) return false;
  let key;
  try { key = base32Decode(secret); } catch { return false; }
  const counter = Math.floor(now / 30000);
  for (let drift = -1; drift <= 1; drift++) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter + drift));
    const digest = createHmac('sha1', key).update(buffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const code = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
    const expected = String(code % 1000000).padStart(6, '0');
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)))) return true;
  }
  return false;
}

export function totpUri(secret, email) {
  const label = encodeURIComponent(`MKS Register:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=MKS%20Register&algorithm=SHA1&digits=6&period=30`;
}

export function encryptSecret(value) {
  const keyText = process.env.AUTH_ENCRYPTION_KEY?.trim();
  if (!keyText || keyText.length < 32) throw new Error('AUTH_ENCRYPTION_KEY must be configured with at least 32 characters.');
  const key = createHash('sha256').update(keyText).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value) {
  const keyText = process.env.AUTH_ENCRYPTION_KEY?.trim();
  if (!keyText || keyText.length < 32) throw new Error('AUTH_ENCRYPTION_KEY must be configured with at least 32 characters.');
  const [ivText, tagText, encryptedText] = String(value).split('.');
  const key = createHash('sha256').update(keyText).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
}
