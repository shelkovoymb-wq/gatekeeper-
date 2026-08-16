/**
 * Резервные коды 2FA — единственный способ войти, если утерян телефон.
 *
 * Хранение: SHA-256 без соли и без KDF. Это осознанно и отличается от паролей:
 * код генерируем мы, а не человек, в нём 50 бит энтропии (10 символов из
 * алфавита в 32 знака), поэтому перебор по украденному хешу бессмысленен, а
 * scrypt на 10 кодов превратил бы каждую проверку в секунду CPU.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

/** Без 0/1/O/I/L/U — чтобы код нельзя было списать с бумажки неправильно. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_LENGTH = 10;
export const BACKUP_CODES_COUNT = 10;

/** Формат выдачи: XXXXX-XXXXX — так его проще прочитать и перенести. */
export function generateBackupCodes(count = BACKUP_CODES_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let raw = '';
    for (let j = 0; j < CODE_LENGTH; j += 1) raw += ALPHABET[randomInt(ALPHABET.length)];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

/** Нормализация ввода: регистр, дефисы и пробелы не должны иметь значения. */
export function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

export function hashBackupCodes(codes: string[]): string[] {
  return codes.map(hashBackupCode);
}

/**
 * Ищет код среди хешей. Возвращает индекс совпадения или -1.
 * Совпавший код обязан быть удалён вызывающим — коды одноразовые.
 */
export function findBackupCode(hashes: string[], code: string): number {
  const candidate = Buffer.from(hashBackupCode(code), 'utf8');
  let found = -1;
  // Проходим весь список даже после совпадения — время ответа не должно
  // зависеть от позиции кода.
  for (let i = 0; i < hashes.length; i += 1) {
    const stored = Buffer.from(hashes[i], 'utf8');
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate) && found === -1) {
      found = i;
    }
  }
  return found;
}
