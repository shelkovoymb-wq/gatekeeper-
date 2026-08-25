import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';
import { PaymentStatus } from './payment.types.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

/** Провайдер, чей вебхук всегда подтверждает платёж. */
function okProvider(status = PaymentStatus.SUCCEEDED) {
  return {
    name: 'yookassa',
    initiate: vi.fn(),
    refund: vi.fn(),
    verify: vi.fn().mockResolvedValue({
      provider: 'yookassa',
      providerPaymentId: 'yk_777',
      status,
      amount: 50000,
      currency: 'RUB',
      timestamp: Date.now(),
      data: {},
    }),
  };
}

const CTX = { body: {}, headers: {} };

/**
 * Успешный платёж должен открывать доступ. Раньше вебхук только менял статус:
 * подписчик платил через ЮKassa, платёж становился succeeded — и подписки он
 * не получал.
 */
describe('PaymentsService — выдача доступа после вебхука', () => {
  let service: PaymentsService;
  let fake: FakeDb;
  let fulfillment: { fulfill: ReturnType<typeof vi.fn> };

  const buildService = (provider = okProvider()) => {
    const created = createFakeDb();
    fake = created.fake;
    fulfillment = { fulfill: vi.fn().mockResolvedValue(undefined) };
    service = new PaymentsService(
      created.db,
      {} as never,
      provider as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      fulfillment as never,
    );
    return provider;
  };

  beforeEach(() => buildService());

  const paymentRow = (metadata: unknown) => ({
    id: 'row-1',
    provider: 'yookassa',
    providerPaymentId: 'yk_777',
    metadata,
  });

  const storefrontMeta = {
    botId: 'bot-1',
    planId: 'plan-1',
    tgUserId: 42,
    username: 'ivan',
    firstName: 'Иван',
  };

  it('выдаёт доступ по данным, которые витрина положила в metadata', async () => {
    fake.queue([paymentRow(storefrontMeta)], []);

    await service.handleWebhook('yookassa', CTX);

    expect(fulfillment.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: 'bot-1',
        planId: 'plan-1',
        tgUserId: 42,
        providerPaymentId: 'yk_777',
        alreadyRecorded: true,
      }),
    );
  });

  it('не пишет второй платёж: строка уже создана при инициации', async () => {
    fake.queue([paymentRow(storefrontMeta)], []);

    await service.handleWebhook('yookassa', CTX);

    const [arg] = fulfillment.fulfill.mock.calls[0] as [Record<string, unknown>];
    expect(arg.alreadyRecorded).toBe(true);
  });

  it.each([
    ['без metadata', null],
    ['без planId', { botId: 'bot-1', tgUserId: 42 }],
    ['без botId', { planId: 'plan-1', tgUserId: 42 }],
    ['без tgUserId', { botId: 'bot-1', planId: 'plan-1' }],
    ['tgUserId строкой', { botId: 'bot-1', planId: 'plan-1', tgUserId: '42' }],
  ])('не трогает подписку %s', async (_name, meta) => {
    fake.queue([paymentRow(meta)], []);

    await service.handleWebhook('yookassa', CTX);

    expect(fulfillment.fulfill).not.toHaveBeenCalled();
  });

  it.each([PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.PENDING])(
    'не выдаёт доступ при статусе %s',
    async (status) => {
      buildService(okProvider(status));
      fake.queue([paymentRow(storefrontMeta)], []);

      await service.handleWebhook('yookassa', CTX);

      expect(fulfillment.fulfill).not.toHaveBeenCalled();
    },
  );

  it('падение выдачи не роняет обработку вебхука', async () => {
    fake.queue([paymentRow(storefrontMeta)], []);
    fulfillment.fulfill.mockRejectedValue(new Error('телеграм недоступен'));

    // Провайдер не должен получить ошибку: иначе он начнёт повторять вебхук,
    // а деньги уже приняты и статус проставлен.
    await expect(service.handleWebhook('yookassa', CTX)).resolves.toMatchObject({
      status: PaymentStatus.SUCCEEDED,
    });
  });
});
