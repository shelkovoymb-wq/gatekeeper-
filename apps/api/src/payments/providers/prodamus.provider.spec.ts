import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { ProdamusProvider } from './prodamus.provider.js';
import type { ProviderCredentials } from '../provider-credentials.js';
import { PaymentStatus } from '../payment.types.js';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const SECRET = 'секретный-ключ-клиента';

/** Резолвер, отдающий заранее заданные ключи — БД в этих тестах не нужна. */
function stubCredentials(stored: Record<string, string>): ProviderCredentials {
  return {
    get: vi.fn().mockResolvedValue(stored),
    pick: (creds: Record<string, string>, field: string) => creds[field] || undefined,
  } as unknown as ProviderCredentials;
}

/** Тело вебхука + корректная подпись, как её считает Prodamus. */
function signedWebhook(payload: Record<string, unknown>, secret = SECRET) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  return {
    body: payload,
    rawBody,
    headers: { 'x-prodamus-signature': signature },
  };
}

const validPayload = {
  id: 'pay_777',
  order_id: 'order_777',
  status: 'paid',
  amount: 1500,
  currency: 'RUB',
  created_at: '2026-08-16T12:00:00Z',
  metadata: { clientId: CLIENT },
};

describe('ProdamusProvider', () => {
  let provider: ProdamusProvider;

  beforeEach(() => {
    provider = new ProdamusProvider(stubCredentials({ apiKey: 'k', secretKey: SECRET }));
  });

  describe('проверка подписи вебхука', () => {
    it('принимает вебхук с корректной подписью', async () => {
      const webhook = await provider.verify(signedWebhook(validPayload) as never);

      expect(webhook.provider).toBe('prodamus');
      expect(webhook.providerPaymentId).toBe('pay_777');
      expect(webhook.status).toBe(PaymentStatus.SUCCEEDED);
      expect(webhook.amount).toBe(150000); // рубли → копейки
    });

    it('отвергает подделанную подпись', async () => {
      const ctx = signedWebhook(validPayload);
      ctx.headers['x-prodamus-signature'] = 'a'.repeat(64);

      await expect(provider.verify(ctx as never)).rejects.toThrow(/signature mismatch/);
    });

    it('отвергает подпись, сделанную чужим секретом', async () => {
      const ctx = signedWebhook(validPayload, 'секрет-другого-клиента');
      await expect(provider.verify(ctx as never)).rejects.toThrow(/signature mismatch/);
    });

    it('отвергает подменённое тело при валидной подписи от исходного', async () => {
      const ctx = signedWebhook(validPayload);
      // Подпись осталась от суммы 1500, а тело подменили на 999999.
      ctx.rawBody = Buffer.from(JSON.stringify({ ...validPayload, amount: 999999 }));

      await expect(provider.verify(ctx as never)).rejects.toThrow(/signature mismatch/);
    });

    it('отвергает вебхук без подписи', async () => {
      const ctx = signedWebhook(validPayload);
      delete (ctx.headers as Record<string, unknown>)['x-prodamus-signature'];

      await expect(provider.verify(ctx as never)).rejects.toThrow(/missing signature/);
    });

    it('отвергает вебхук без сырого тела — подпись не с чем сверить', async () => {
      const ctx = signedWebhook(validPayload);
      (ctx as { rawBody?: Buffer }).rawBody = undefined;

      await expect(provider.verify(ctx as never)).rejects.toThrow(/missing signature or raw body/);
    });

    it('не пытается проверять подпись без clientId в metadata', async () => {
      const { metadata: _drop, ...noClient } = validPayload;
      await expect(provider.verify(signedWebhook(noClient) as never)).rejects.toThrow(
        /missing clientId/,
      );
    });

    it('отказывает, если у клиента не настроен секретный ключ', async () => {
      const bare = new ProdamusProvider(stubCredentials({}));
      await expect(bare.verify(signedWebhook(validPayload) as never)).rejects.toThrow(
        /not configured/,
      );
    });
  });

  describe('разбор статуса', () => {
    it.each([
      ['paid', PaymentStatus.SUCCEEDED],
      ['completed', PaymentStatus.SUCCEEDED],
      ['success', PaymentStatus.SUCCEEDED],
      ['failed', PaymentStatus.FAILED],
      ['cancelled', PaymentStatus.CANCELLED],
      ['pending', PaymentStatus.PENDING],
    ])('%s → %s', async (raw, expected) => {
      const webhook = await provider.verify(
        signedWebhook({ ...validPayload, status: raw }) as never,
      );
      expect(webhook.status).toBe(expected);
    });

    it('неизвестный статус не считается оплатой', async () => {
      const webhook = await provider.verify(
        signedWebhook({ ...validPayload, status: 'нечто-новое' }) as never,
      );
      expect(webhook.status).toBe(PaymentStatus.PENDING);
    });
  });

  describe('инициация платежа', () => {
    it('отказывает, если клиент не настроил Prodamus', async () => {
      const bare = new ProdamusProvider(stubCredentials({}));
      await expect(
        bare.initiate({ clientId: CLIENT, amount: 100, description: 'x' } as never),
      ).rejects.toThrow(/not configured/);
    });

    it('шлёт вебхуки на путь, который реально проброшен наружу', async () => {
      process.env.PUBLIC_API_URL = 'https://gatekeeper.skud24.ru';
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ id: 'pay_1', payment_url: 'https://pay' }), {
            status: 200,
          }),
        );

      await provider.initiate({
        clientId: CLIENT,
        amount: 10000,
        currency: 'RUB',
        description: 'Подписка',
      } as never);

      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.notification_url).toBe(
        'https://gatekeeper.skud24.ru/payments/webhook/prodamus',
      );
      fetchMock.mockRestore();
    });
  });
});
