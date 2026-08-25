import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorefrontService } from './storefront.service.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

const BOT = 'bot-1';
const CLIENT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PLAN = { id: 'plan-1', name: 'Базовый', price: 500, currency: 'RUB', periodDays: 30, starsPrice: 250 };

function callback(data: string) {
  return {
    id: 'cq-1',
    data,
    from: { id: 42, username: 'ivan', first_name: 'Иван' },
  };
}

/**
 * Витрина должна предлагать ровно то, что клиент включил в кабинете. Раньше
 * здесь была одна захардкоженная кнопка со звёздами: клиент настраивал ЮKassa
 * или СБП и ждал платежей, которых быть не могло.
 */
describe('StorefrontService — способы оплаты в боте', () => {
  let service: StorefrontService;
  let fake: FakeDb;
  let tg: { sendMessage: ReturnType<typeof vi.fn>; answerCallbackQuery: ReturnType<typeof vi.fn>; sendStarsInvoice: ReturnType<typeof vi.fn> };
  let payments: { initiatePayment: ReturnType<typeof vi.fn> };
  let fulfillment: { reissueIfActive: ReturnType<typeof vi.fn>; fulfill: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    tg = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      sendStarsInvoice: vi.fn().mockResolvedValue(undefined),
    };
    payments = {
      initiatePayment: vi.fn().mockResolvedValue({
        paymentId: 'yk_1',
        url: 'https://pay.example/1',
        status: 'pending',
      }),
    };
    fulfillment = {
      reissueIfActive: vi.fn().mockResolvedValue(false),
      fulfill: vi.fn().mockResolvedValue(undefined),
    };
    service = new StorefrontService(
      created.db,
      tg as never,
      fulfillment as never,
      payments as never,
    );
  });

  /** Очередь ответов БД для сценария «нажали купить». */
  function queueBuy(configs: { provider: string }[], accounts: { accountType: string }[]) {
    fake.queue(
      [PLAN],              // plansForBot
      [{ clientId: CLIENT }], // clientOfBot
      configs,             // payment_configs
      accounts,            // direct_payment_accounts
    );
  }

  const buttons = () => {
    const [, , , markup] = tg.sendMessage.mock.calls.at(-1) as [string, number, string, { inline_keyboard: { text: string; callback_data?: string }[][] }];
    return markup.inline_keyboard.flat();
  };

  it('предлагает звёзды, когда включены только они', async () => {
    queueBuy([{ provider: 'stars' }], []);

    await service.onCallback(BOT, callback(`buy:${PLAN.id}`) as never);

    expect(buttons().map((b) => b.text)).toEqual(['⭐ Telegram Stars']);
  });

  it('предлагает каждую включённую платёжную систему', async () => {
    queueBuy([{ provider: 'yookassa' }, { provider: 'prodamus' }], []);

    const texts = (await service.onCallback(BOT, callback(`buy:${PLAN.id}`) as never), buttons()).map((b) => b.text);

    expect(texts).toContain('💳 Картой через ЮKassa');
    expect(texts).toContain('💳 Картой через Prodamus');
  });

  it('предлагает прямой перевод, когда у клиента есть активные реквизиты', async () => {
    queueBuy([], [{ accountType: 'sbp' }]);

    await service.onCallback(BOT, callback(`buy:${PLAN.id}`) as never);

    expect(buttons().map((b) => b.text)).toEqual(['⚡ Перевод по СБП']);
  });

  it('показывает и системы, и реквизиты вместе', async () => {
    queueBuy([{ provider: 'stars' }, { provider: 'yookassa' }], [{ accountType: 'card' }]);

    await service.onCallback(BOT, callback(`buy:${PLAN.id}`) as never);

    expect(buttons()).toHaveLength(3);
  });

  it('не предлагает выключенного провайдера', async () => {
    // Запрос идёт с фильтром is_active, выключенный просто не вернётся.
    queueBuy([{ provider: 'stars' }], []);

    await service.onCallback(BOT, callback(`buy:${PLAN.id}`) as never);

    expect(buttons().map((b) => b.text)).not.toContain('💳 Картой через ЮKassa');
  });

  it('честно говорит, когда оплата не настроена вовсе', async () => {
    queueBuy([], []);

    await service.onCallback(BOT, callback(`buy:${PLAN.id}`) as never);

    const [, , text] = tg.sendMessage.mock.calls.at(-1) as [string, number, string];
    expect(text).toContain('не настроена');
  });

  describe('оплата через платёжную систему', () => {
    it('создаёт платёж в копейках и отдаёт ссылку кнопкой', async () => {
      fake.queue([PLAN], [{ clientId: CLIENT }]);

      await service.onCallback(BOT, callback(`payp:yookassa|${PLAN.id}`) as never);

      const [req] = payments.initiatePayment.mock.calls[0] as [Record<string, unknown>];
      expect(req.amount).toBe(50000);
      expect(req.provider).toBe('yookassa');
      expect(buttons()[0]).toMatchObject({ url: 'https://pay.example/1' });
    });

    it('кладёт в metadata всё, что нужно для выдачи доступа по вебхуку', async () => {
      fake.queue([PLAN], [{ clientId: CLIENT }]);

      await service.onCallback(BOT, callback(`payp:yookassa|${PLAN.id}`) as never);

      const [req] = payments.initiatePayment.mock.calls[0] as [{ metadata: Record<string, unknown> }];
      expect(req.metadata).toMatchObject({
        botId: BOT,
        planId: PLAN.id,
        tgUserId: 42,
        payeeClientId: CLIENT,
      });
    });

    it('не молчит, когда провайдер не вернул ссылку', async () => {
      fake.queue([PLAN], [{ clientId: CLIENT }]);
      payments.initiatePayment.mockResolvedValue({ paymentId: 'x', url: null, status: 'pending' });

      await service.onCallback(BOT, callback(`payp:yookassa|${PLAN.id}`) as never);

      const [, , text] = tg.sendMessage.mock.calls.at(-1) as [string, number, string];
      expect(text).toContain('не вернула ссылку');
    });

    it('не роняет бота, когда создание платежа упало', async () => {
      fake.queue([PLAN], [{ clientId: CLIENT }]);
      payments.initiatePayment.mockRejectedValue(new Error('провайдер недоступен'));

      await expect(
        service.onCallback(BOT, callback(`payp:yookassa|${PLAN.id}`) as never),
      ).resolves.toBeUndefined();

      const [, , text] = tg.sendMessage.mock.calls.at(-1) as [string, number, string];
      expect(text).toContain('Не удалось создать платёж');
    });
  });

  describe('прямой перевод', () => {
    it('показывает подписчику реквизиты и назначение платежа', async () => {
      fake.queue([PLAN], [{ clientId: CLIENT }]);
      payments.initiatePayment.mockResolvedValue({
        paymentId: 'dir_1',
        url: null,
        status: 'pending',
        instruction: {
          accountType: 'sbp',
          amount: '500.00',
          currency: 'RUB',
          orderId: 'dir_1',
          phoneNumber: '+79991234567',
        },
      });

      await service.onCallback(BOT, callback(`payd:${PLAN.id}`) as never);

      const [, , text] = tg.sendMessage.mock.calls.at(-1) as [string, number, string];
      expect(text).toContain('+79991234567');
      expect(text).toContain('500.00');
      expect(text).toContain('dir_1');
    });

    it('показывает банковские реквизиты полностью', async () => {
      fake.queue([PLAN], [{ clientId: CLIENT }]);
      payments.initiatePayment.mockResolvedValue({
        paymentId: 'dir_2',
        url: null,
        status: 'pending',
        instruction: {
          accountType: 'bank_account',
          amount: '500.00',
          currency: 'RUB',
          orderId: 'dir_2',
          bankName: 'Сбербанк',
          accountNumber: '40817810638050123456',
          bic: '044525225',
        },
      });

      await service.onCallback(BOT, callback(`payd:${PLAN.id}`) as never);

      const [, , text] = tg.sendMessage.mock.calls.at(-1) as [string, number, string];
      expect(text).toContain('Сбербанк');
      expect(text).toContain('40817810638050123456');
      expect(text).toContain('044525225');
    });
  });
});
