import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { ProviderCredentials } from './provider-credentials.js';
import { SecretBox } from '../common/crypto.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const OTHER_CLIENT = '22222222-2222-2222-2222-222222222222';

describe('ProviderCredentials', () => {
  let creds: ProviderCredentials;
  let fake: FakeDb;
  let box: SecretBox;

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    box = new SecretBox(randomBytes(32).toString('base64'));
    creds = new ProviderCredentials(created.db, box);
  });

  afterEach(() => {
    delete process.env[`YOOKASSA_SHOP_ID_${CLIENT.toUpperCase()}`];
  });

  describe('чтение из кабинета', () => {
    it('расшифровывает то, что клиент сохранил в кабинете', async () => {
      fake.queue([
        { credentialsEnc: box.encrypt(JSON.stringify({ apiKey: 'k-1', secretKey: 's-1' })) },
      ]);

      await expect(creds.get(CLIENT, 'prodamus')).resolves.toEqual({
        apiKey: 'k-1',
        secretKey: 's-1',
      });
    });

    it('отдаёт пустой набор, если провайдер не настроен', async () => {
      fake.queue([]);
      await expect(creds.get(CLIENT, 'prodamus')).resolves.toEqual({});
    });

    it('отдаёт пустой набор, если credentials_enc пустой (Telegram Stars)', async () => {
      fake.queue([{ credentialsEnc: null }]);
      await expect(creds.get(CLIENT, 'stars')).resolves.toEqual({});
    });

    it('приводит значения к строкам и выбрасывает пустые', async () => {
      fake.queue([
        {
          credentialsEnc: box.encrypt(
            JSON.stringify({ merchantLogin: 'shop', password1: 12345, password2: '', extra: null }),
          ),
        },
      ]);

      await expect(creds.get(CLIENT, 'robokassa')).resolves.toEqual({
        merchantLogin: 'shop',
        password1: '12345',
      });
    });
  });

  describe('безопасность', () => {
    it('запрашивает ключи строго по clientId и provider — чужие не подтянет', async () => {
      fake.queue([]);
      await creds.get(CLIENT, 'prodamus');

      // where(...) получает готовое условие drizzle, поэтому проверяем, что
      // фильтр вообще был наложен и запрос ограничен одной строкой.
      const methods = fake.calls.map((c) => c.method);
      expect(methods).toContain('where');
      expect(methods).toContain('limit');
      expect(fake.argsOf('limit')).toEqual([1]);
    });

    it('ключи одного клиента не утекают в ответ для другого', async () => {
      fake.queue([{ credentialsEnc: box.encrypt(JSON.stringify({ apiKey: 'ключ-клиента-A' })) }]);
      const a = await creds.get(CLIENT, 'prodamus');

      // Для второго клиента база вернула пустоту — значит и ключей быть не должно.
      fake.queue([]);
      const b = await creds.get(OTHER_CLIENT, 'prodamus');

      expect(a).toEqual({ apiKey: 'ключ-клиента-A' });
      expect(b).toEqual({});
    });

    it('битый конверт не роняет платёж и не отдаёт мусор наружу', async () => {
      fake.queue([{ credentialsEnc: 'не-base64-и-не-конверт' }]);
      await expect(creds.get(CLIENT, 'prodamus')).resolves.toEqual({});
    });

    it('конверт, зашифрованный другим ключом, не расшифровывается', async () => {
      const foreign = new SecretBox(randomBytes(32).toString('base64'));
      fake.queue([{ credentialsEnc: foreign.encrypt(JSON.stringify({ apiKey: 'чужой' })) }]);

      await expect(creds.get(CLIENT, 'prodamus')).resolves.toEqual({});
    });

    it('подделанный тег GCM отвергается', async () => {
      const envelope = box.encrypt(JSON.stringify({ apiKey: 'k' }));
      const buf = Buffer.from(envelope, 'base64');
      buf[13] ^= 0xff; // портим байт внутри тега
      fake.queue([{ credentialsEnc: buf.toString('base64') }]);

      await expect(creds.get(CLIENT, 'prodamus')).resolves.toEqual({});
    });
  });

  describe('pick: кабинет важнее окружения', () => {
    it('берёт значение из кабинета, даже когда переменная окружения задана', () => {
      process.env[`YOOKASSA_SHOP_ID_${CLIENT.toUpperCase()}`] = 'из-окружения';
      expect(creds.pick({ shopId: 'из-кабинета' }, 'shopId', 'YOOKASSA_SHOP_ID', CLIENT)).toBe(
        'из-кабинета',
      );
    });

    it('падает обратно на окружение, если в кабинете пусто', () => {
      process.env[`YOOKASSA_SHOP_ID_${CLIENT.toUpperCase()}`] = 'из-окружения';
      expect(creds.pick({}, 'shopId', 'YOOKASSA_SHOP_ID', CLIENT)).toBe('из-окружения');
    });

    it('отдаёт undefined, когда не настроено нигде', () => {
      expect(creds.pick({}, 'shopId', 'YOOKASSA_SHOP_ID', CLIENT)).toBeUndefined();
    });
  });
});
