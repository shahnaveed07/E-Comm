import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function generateRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function signHmacSha256(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function hashPasswordBcrypt(password, rounds = 10) {
  return bcrypt.hash(String(password), rounds);
}

export async function verifyPasswordAny(password, user) {
  if (!password || !user?.passwordHash) return false;
  if (user.passwordAlgo === 'scrypt-legacy' && user.passwordSalt) {
    const derived = crypto.scryptSync(String(password), user.passwordSalt, 64);
    const expected = Buffer.from(user.passwordHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }
  return bcrypt.compare(String(password), user.passwordHash);
}
