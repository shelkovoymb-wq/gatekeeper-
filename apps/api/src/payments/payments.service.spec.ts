import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentStatus } from './payment.types.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

/** Заглушка адаптера провайдера — ровно тот контракт, который зовёт сервис. */
function stubProvider(paymentId: string, url: string | null) {
  return {
    initiate: vi.fn().mockResolvedValue({ url, paymentId }),
    verify: vi.fn(),
    refund: vi.fn().mockResolvedValue(true),
  };
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let fake: FakeDb;
  let yookassa: ReturnType<typeof stubProvider>;
  let fulfillment: { fulfill: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    yookassa = stubProvider('yk_123', 'https://yookassa.ru/checkout');

    fulfillment = { fulfill: vi.fn().mockResolvedValue(undefined) };
    service = new PaymentsService(
      created.db,
      stubProvider('stars_123', null) as never,
      yookassa as never,
      stubProvider('cp_123', 'https://cloudpayments.ru') as never,
      stubProvider('rb_123', 'https://robokassa.ru') as never,
      stubProvider('pd_123', 'https://prodamus.ru') as never,
      stubProvider('dt_123', null) as never,
      fulfillment as never,
    );
  });

  const request = {
    clientId: 'client_1',
    subscriberId: 'sub_1',
    subscriptionId: 'subc_1',
    amount: 99900,
    currency: 'RUB',
    provider: 'yookassa',
    description: 'Тестовый платёж',
  };

  describe('initiatePayment', () => {
    it('зовёт адаптер выбранного провайдера и возвращает ссылку на оплату', async () => {
      fake.queue([]);

      const result = await service.initiatePayment(request);

      expect(yookassa.initiate).toHaveBeenCalledWith(request);
      expect(result).toMatchObject({
        paymentId: 'yk_123',
        url: 'https://yookassa.ru/checkout',
        status: PaymentStatus.PENDING,
      });
    });

    it('сохраняет платёж как pending, переводя копейки в рубли', async () => {
      fake.queue([]);

      await service.initiatePayment(request);

      const [values] = fake.argsOf('values') as [Record<string, unknown>];
      expect(values.status).toBe(PaymentStatus.PENDING);
      // request.amount = 99900 копеек. В payments.amount кладём рубли: из этой
      // колонки считается оборот и комиссия в счёте платформы, и без деления
      // комиссия выходила в сто раз больше реальной.
      expect(values.amount).toBe('999.00');
      expect(values.provider).toBe('yookassa');
      expect(values.providerPaymentId).toBe('yk_123');
    });

    it.each(['stars', 'yookassa', 'cloudpayments', 'robokassa', 'prodamus', 'direct'])(
      'поддерживает провайдера %s',
      async (provider) => {
        fake.queue([]);
        await expect(
          service.initiatePayment({ ...request, provider }),
        ).resolves.toMatchObject({ status: PaymentStatus.PENDING });
      },
    );

    it('отвергает незарегистрированного провайдера', async () => {
      await expect(
        service.initiatePayment({ ...request, provider: 'invalid_provider' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('не пишет в базу, если провайдер не найден', async () => {
      await expect(
        service.initiatePayment({ ...request, provider: 'invalid_provider' }),
      ).rejects.toThrow();

      expect(fake.calls.some((c) => c.method === 'insert')).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('отвергает вебхук от неизвестного провайдера', async () => {
      await expect(
        service.handleWebhook('invalid_provider', { body: {}, headers: {} } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('превращает провал проверки подписи в 400, не пропуская платёж дальше', async () => {
      yookassa.verify.mockRejectedValue(new Error('bad signature'));

      await expect(
        service.handleWebhook('yookassa', { body: {}, headers: {} } as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(fake.calls.some((c) => c.method === 'update')).toBe(false);
    });

    it('бросает NotFound, если платежа из вебхука нет в базе', async () => {
      yookassa.verify.mockResolvedValue({
        provider: 'yookassa',
        providerPaymentId: 'yk_404',
        status: PaymentStatus.SUCCEEDED,
        data: {},
      });
      fake.queue([]);

      await expect(
        service.handleWebhook('yookassa', { body: {}, headers: {} } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('проставляет платежу статус из проверенного вебхука', async () => {
      yookassa.verify.mockResolvedValue({
        provider: 'yookassa',
        providerPaymentId: 'yk_123',
        status: PaymentStatus.SUCCEEDED,
        data: { foo: 'bar' },
      });
      fake.queue([{ id: 'pay_1' }], []);

      const result = await service.handleWebhook('yookassa', {
        body: {},
        headers: {},
      } as never);

      expect(result).toMatchObject({ id: 'pay_1', status: PaymentStatus.SUCCEEDED });
      const [patch] = fake.argsOf('set') as [Record<string, unknown>];
      expect(patch.status).toBe(PaymentStatus.SUCCEEDED);
      expect(patch.metadata).toEqual({ foo: 'bar' });
    });
  });
});
