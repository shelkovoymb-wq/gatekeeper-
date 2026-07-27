import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt) as (
  pw: string | Buffer,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** Хеширование пароля через встроенный scrypt (без внешних зависимостей). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const dk = await scrypt(pw, salt, expected.length);
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}
