import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotpSecret,
  hotp,
  totp,
  TOTP_PERIOD_SEC,
  verifyTotp,
} from './totp.js';

/** Общий секрет из RFC 4226 / RFC 6238 (Appendix D/B): ASCII "12345678901234567890". */
const RFC_SECRET_ASCII = '12345678901234567890';
const RFC_SECRET_B32 = base32Encode(Buffer.from(RFC_SECRET_ASCII, 'ascii'));

describe('base32', () => {
  it('кодирует по RFC 4648 (тест-векторы)', () => {
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
    expect(base32Encode(Buffer.from('foo'))).toBe('MZXW6');
    expect(base32Encode(Buffer.from('foob'))).toBe('MZXW6YQ');
    expect(base32Encode(Buffer.from('fooba'))).toBe('MZXW6YTB');
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('декодирование обратно к исходным байтам', () => {
    for (const s of ['f', 'fo', 'foo', 'foob', 'fooba', 'foobar', RFC_SECRET_ASCII]) {
      expect(base32Decode(base32Encode(Buffer.from(s))).toString()).toBe(s);
    }
  });

  it('терпим к регистру, пробелам и паддингу', () => {
    expect(base32Decode('mzxw6ytboi').toString()).toBe('foobar');
    expect(base32Decode('MZXW 6YTB OI').toString()).toBe('foobar');
    expect(base32Decode('MZXW6YTBOI======').toString()).toBe('foobar');
  });

  it('отвергает символы вне алфавита', () => {
    expect(() => base32Decode('MZXW6YTB0I')).toThrow(); // 0 нет в base32
  });
});

describe('HOTP (RFC 4226, Appendix D)', () => {
  const expected = [
    '755224', '287082', '359152', '969429', '338314',
    '254676', '287922', '162583', '399871', '520489',
  ];
  it('совпадает с контрольными значениями для счётчиков 0..9', () => {
    const secret = Buffer.from(RFC_SECRET_ASCII, 'ascii');
    expected.forEach((code, counter) => {
      expect(hotp(secret, counter)).toBe(code);
    });
  });
});

describe('TOTP (RFC 6238)', () => {
  it('T=59с даёт код из контрольного вектора SHA-1', () => {
    // RFC даёт 8 цифр (94287082); первые две отбрасываются при digits=6.
    expect(totp(RFC_SECRET_B32, 59_000)).toBe('287082');
  });

  it('код одинаков внутри одного 30-секундного окна и меняется в следующем', () => {
    const base = 1_700_000_000_000;
    const inWindow = base - (base % (TOTP_PERIOD_SEC * 1000));
    expect(totp(RFC_SECRET_B32, inWindow)).toBe(totp(RFC_SECRET_B32, inWindow + 29_000));
    expect(totp(RFC_SECRET_B32, inWindow)).not.toBe(totp(RFC_SECRET_B32, inWindow + 30_000));
  });
});

describe('verifyTotp', () => {
  const now = 1_700_000_000_000;

  it('принимает текущий код и возвращает номер шага', () => {
    const step = verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now), now);
    expect(step).toBe(Math.floor(now / 1000 / TOTP_PERIOD_SEC));
  });

  it('прощает расхождение часов ±1 шаг', () => {
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now + 30_000), now)).not.toBeNull();
  });

  it('отвергает код за пределами окна', () => {
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now - 90_000), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now + 90_000), now)).toBeNull();
  });

  it('отвергает мусор и коды неверной длины', () => {
    expect(verifyTotp(RFC_SECRET_B32, '', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, '12345', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, '1234567', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, 'abcdef', now)).toBeNull();
  });

  it('терпим к пробелам и дефисам в введённом коде', () => {
    const code = totp(RFC_SECRET_B32, now);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(verifyTotp(RFC_SECRET_B32, spaced, now)).not.toBeNull();
  });
});

describe('generateTotpSecret / otpauth', () => {
  it('секрет — 160 бит в base32 и каждый раз новый', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(a).length).toBe(20);
  });

  it('otpauth-URL содержит issuer, секрет и параметры алгоритма', () => {
    const url = new URL(
      buildOtpauthUrl({ secret: RFC_SECRET_B32, accountName: 'user@example.com', issuer: 'Gatekeeper' }),
    );
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/Gatekeeper:user@example.com');
    expect(url.searchParams.get('secret')).toBe(RFC_SECRET_B32);
    expect(url.searchParams.get('issuer')).toBe('Gatekeeper');
    expect(url.searchParams.get('algorithm')).toBe('SHA1');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
  });

  it('спецсимволы в имени аккаунта экранируются, а не ломают URL', () => {
    const url = buildOtpauthUrl({
      secret: RFC_SECRET_B32,
      accountName: 'a b/c?d#e',
      issuer: 'Gate keeper',
    });
    expect(() => new URL(url)).not.toThrow();
    expect(url).not.toContain(' ');
  });
});
