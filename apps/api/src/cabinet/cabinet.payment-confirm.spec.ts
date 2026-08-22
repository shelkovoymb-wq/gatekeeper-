import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CabinetService } from './cabinet.service.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PAYMENT = 'pay-1';

/**
 * Прямой перевод банк платформе не подтверждает, поэтому его закрывает сам
 * получатель. Отметка — это деньги в обороте и комиссия платформы, так что
 * проверяем и границы (чужой платёж, чужой провайдер, повторное нажатие).
 */
describe('CabinetService — подтверждение прямого перевода', () => {
  let service: CabinetService;
  let fake: FakeDb;

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    service = new CabinetService(
      created.db,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('закрывает свой ожидающий прямой перевод', async () => {
    fake.queue(
      [{ id: PAYMENT, provider: 'direct', status: 'pending' }],
      [{ id: PAYMENT, status: 'succeeded' }],
    );

    await expect(service.confirmDirectPayment(CLIENT_A, PAYMENT)).resolves.toMatchObject({
      id: PAYMENT,
      status: 'succeeded',
      confirmedBy: 'client',
    });
  });

  it('помечает, что подтвердил клиент, а не провайдер', async () => {
    fake.queue(
      [{ id: PAYMENT, provider: 'direct', status: 'pending' }],
      [{ id: PAYMENT, status: 'succeeded' }],
    );

    await service.confirmDirectPayment(CLIENT_A, PAYMENT);

    const [patch] = fake.argsOf('set') as [Record<string, unknown>];
    expect(patch.status).toBe('succeeded');
    expect(patch.confirmedBy).toBe('client');
    expect(patch.confirmedAt).toBeInstanceOf(Date);
  });

  it('не даёт подтвердить чужой платёж', async () => {
    // Выборка идёт с фильтром по clientId, чужой просто не находится.
    fake.queue([]);

    await expect(service.confirmDirectPayment(CLIENT_A, 'чужой')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(['yookassa', 'prodamus', 'stars', 'free'])(
    'не даёт подтвердить вручную платёж через %s',
    async (provider) => {
      fake.queue([{ id: PAYMENT, provider, status: 'pending' }]);

      await expect(service.confirmDirectPayment(CLIENT_A, PAYMENT)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it.each(['succeeded', 'failed', 'refunded', 'cancelled'])(
    'не трогает платёж в статусе %s',
    async (status) => {
      fake.queue([{ id: PAYMENT, provider: 'direct', status }]);

      await expect(service.confirmDirectPayment(CLIENT_A, PAYMENT)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('повторное подтверждение не проходит: UPDATE идёт по status=pending', async () => {
    // Первый вызов уже перевёл платёж в succeeded, поэтому UPDATE не вернёт строк.
    fake.queue([{ id: PAYMENT, provider: 'direct', status: 'pending' }], []);

    await expect(service.confirmDirectPayment(CLIENT_A, PAYMENT)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
