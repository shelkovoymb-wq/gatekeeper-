import { describe, expect, it } from 'vitest';
import {
  BACKUP_CODES_COUNT,
  findBackupCode,
  generateBackupCodes,
  hashBackupCode,
  hashBackupCodes,
  normalizeBackupCode,
} from './backup-codes.js';

describe('generateBackupCodes', () => {
  it('выдаёт нужное количество кодов в формате XXXXX-XXXXX', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODES_COUNT);
    for (const c of codes) expect(c).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  });

  it('не содержит визуально спорных символов (0/1/O/I/L/U)', () => {
    const codes = generateBackupCodes(50).join('');
    expect(codes).not.toMatch(/[01OILU]/);
  });

  it('коды не повторяются', () => {
    const codes = generateBackupCodes(50);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('normalizeBackupCode', () => {
  it('игнорирует регистр, дефисы и пробелы', () => {
    expect(normalizeBackupCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeBackupCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK');
    expect(normalizeBackupCode('ABCDE-FGHJK')).toBe('ABCDEFGHJK');
  });
});

describe('hashBackupCode', () => {
  it('хеш не равен самому коду и стабилен', () => {
    const code = 'ABCDE-FGHJK';
    const h = hashBackupCode(code);
    expect(h).not.toContain('ABCDE');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashBackupCode(code)).toBe(h);
  });

  it('нормализованные варианты дают один хеш', () => {
    expect(hashBackupCode('abcde fghjk')).toBe(hashBackupCode('ABCDE-FGHJK'));
  });
});

describe('findBackupCode', () => {
  it('находит код по хешу и возвращает его индекс', () => {
    const codes = generateBackupCodes();
    const hashes = hashBackupCodes(codes);
    expect(findBackupCode(hashes, codes[3])).toBe(3);
    expect(findBackupCode(hashes, codes[0].toLowerCase())).toBe(0);
    expect(findBackupCode(hashes, codes[9].replace('-', ''))).toBe(9);
  });

  it('возвращает -1 для чужого кода и для пустого списка', () => {
    const hashes = hashBackupCodes(generateBackupCodes());
    expect(findBackupCode(hashes, 'ZZZZZ-ZZZZZ')).toBe(-1);
    expect(findBackupCode(hashes, '')).toBe(-1);
    expect(findBackupCode([], 'ABCDE-FGHJK')).toBe(-1);
  });

  it('удаление найденного кода делает его непригодным повторно', () => {
    const codes = generateBackupCodes();
    let hashes = hashBackupCodes(codes);
    const idx = findBackupCode(hashes, codes[5]);
    hashes = hashes.filter((_, i) => i !== idx);
    expect(findBackupCode(hashes, codes[5])).toBe(-1);
    expect(findBackupCode(hashes, codes[6])).not.toBe(-1);
  });
});
