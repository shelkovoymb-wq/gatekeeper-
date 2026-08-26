import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { canonicalPayload, prodamusSignature } from './prodamus-signature.js';

const SECRET = 'demo-secret-key';

/**
 * Эталонный вектор из скилла prodamus-subscription (assets/sign-check.mjs).
 * В нём собраны три ловушки: URL со слешами, кириллица и число с null.
 */
const PAYLOAD = {
  order_num: 'tenant-42',
  sum: 1490,
  customer_phone: '79001234567',
  customer_email: 'owner@example.com',
  payment_status: 'success',
  payment_init: 'manual',
  demo_flag: null,
  link: 'https://example.com/pay/success',
  products: [{ name: 'Подписка на сервис', price: '1490', quantity: '1' }],
  subscription: { id: '111111', profile_id: '222222', type: 'action', action_code: 'first_payment' },
};

const EXPECTED = '903c7bc6e4d2d50b6bae95e5288246623c39ea3aa5b732af9ef954355719f358';

describe('Подпись вебхука Продамуса', () => {
  it('сходится на эталонном payload', () => {
    expect(prodamusSignature(SECRET, PAYLOAD)).toBe(EXPECTED);
  });

  it('экранирует слеши — иначе любой URL в теле ломает подпись', () => {
    expect(canonicalPayload({ link: 'https://a/b' })).toContain('https:\\/\\/a\\/b');

    const withoutEscape = createHmac('sha256', SECRET)
      .update(JSON.stringify(PAYLOAD), 'utf8')
      .digest('hex');
    expect(withoutEscape).not.toBe(EXPECTED);
  });

  it('сортирует ключи рекурсивно, включая вложенные объекты', () => {
    const a = canonicalPayload({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalPayload({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a.indexOf('"a"')).toBeLessThan(a.indexOf('"b"'));
  });

  it('приводит скаляры к строкам, а null — к пустой строке, не к "null"', () => {
    expect(canonicalPayload({ n: 1490, t: true, z: null })).toBe(
      '{"n":"1490","t":"true","z":""}',
    );
  });

  it('оставляет кириллицу как есть, не экранирует в \\uXXXX', () => {
    expect(canonicalPayload({ name: 'Подписка' })).toContain('Подписка');
  });

  it('срезает хвостовые переводы строк, но не значимые пробелы', () => {
    expect(canonicalPayload({ v: 'значение\r\n' })).toBe('{"v":"значение"}');
    expect(canonicalPayload({ v: ' значение ' })).toBe('{"v":" значение "}');
  });

  it('уплотнения массивов не ломает: порядок элементов сохраняется', () => {
    expect(canonicalPayload({ p: [{ b: 1 }, { a: 2 }] })).toBe('{"p":[{"b":"1"},{"a":"2"}]}');
  });

  it('другой секрет даёт другую подпись', () => {
    expect(prodamusSignature('другой-ключ', PAYLOAD)).not.toBe(EXPECTED);
  });
});
