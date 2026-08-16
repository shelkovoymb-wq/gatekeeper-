/**
 * TOTP (RFC 6238) поверх HOTP (RFC 4226) на встроенном node:crypto —
 * без внешних зависимостей, как и `password.ts`.
 *
 * Совместимо с Google Authenticator / Authy / Яндекс.Ключ: SHA-1, 6 цифр,
 * шаг 30 секунд. Эти параметры зашиты не «для простоты», а потому что
 * большинство мобильных приложений игнорирует `algorithm`/`digits` в
 * otpauth-URL и всегда считают по дефолту — расхождение дало бы коды,
 * которые не сходятся.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SEC = 30;
/** ±1 шаг (±30 с) — компенсирует расхождение часов телефона и сервера. */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 (RFC 4648, без паддинга) — формат секрета в otpauth-URL. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Новый секрет: 20 байт энтропии = 160 бит, как рекомендует RFC 4226. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP по RFC 4226: динамическая усечка HMAC-SHA1. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

/** Текущий код для секрета в base32. `atMs` — для тестов/предсказуемости. */
export function totp(secretBase32: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / TOTP_PERIOD_SEC);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Проверка кода с окном ±TOTP_WINDOW шагов.
 * Возвращает номер использованного шага (для защиты от повторного
 * использования кода) либо null, если код не подошёл.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs: number = Date.now(),
  window = TOTP_WINDOW,
): number | null {
  const normalized = code.replace(/\D/g, '');
  if (normalized.length !== TOTP_DIGITS) return null;
  const secret = base32Decode(secretBase32);
  const current = Math.floor(atMs / 1000 / TOTP_PERIOD_SEC);
  for (let drift = -window; drift <= window; drift += 1) {
    const step = current + drift;
    if (step < 0) continue;
    if (timingSafeEqualStr(hotp(secret, step), normalized)) return step;
  }
  return null;
}

/** Сравнение кодов за константное время — коды короткие, утечка по таймингу реальна. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * otpauth-URL для QR-кода. `label` — обычно email пользователя,
 * `issuer` — название сервиса, оно же показывается в приложении.
 */
export function buildOtpauthUrl(params: {
  secret: string;
  accountName: string;
  issuer: string;
}): string {
  const label = `${params.issuer}:${params.accountName}`;
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}
