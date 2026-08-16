import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CabinetService } from './cabinet.service.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CHANNEL_A = 'ch-a';
const PLAN_B = 'plan-b';

/**
 * Изоляция арендаторов: клиент не должен дотянуться до чужих объектов, даже
 * подставив их id напрямую в запрос. Все проверки владельца делаются в сервисе,
 * поэтому и тесты идут против сервиса.
 */
describe('CabinetService — изоляция арендаторов', () => {
  let service: CabinetService;
  let fake: FakeDb;
  let channelsSvc: { createInviteLink: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    channelsSvc = { createInviteLink: vi.fn().mockResolvedValue('https://t.me/+link') };

    service = new CabinetService(
      created.db,
      {} as never, // SecretBox — в этих сценариях не участвует
      {} as never, // BotsService
      {} as never, // PlansService
      channelsSvc as never,
    );
  });

  describe('createInviteLink', () => {
    it('создаёт ссылку на своём канале со своим тарифом', async () => {
      fake.queue([{ clientId: CLIENT_A }], [{ clientId: CLIENT_A }]);

      await expect(
        service.createInviteLink(CLIENT_A, CHANNEL_A, 'plan-a'),
      ).resolves.toEqual({ url: 'https://t.me/+link' });
    });

    it('не даёт привязать чужой тариф к своему каналу', async () => {
      // Канал свой…
      fake.queue([{ clientId: CLIENT_A }]);
      // …а тариф принадлежит другому клиенту.
      fake.queue([{ clientId: CLIENT_B }]);

      await expect(
        service.createInviteLink(CLIENT_A, CHANNEL_A, PLAN_B),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('не создаёт ссылку в Telegram, когда тариф чужой', async () => {
      fake.queue([{ clientId: CLIENT_A }], [{ clientId: CLIENT_B }]);

      await expect(service.createInviteLink(CLIENT_A, CHANNEL_A, PLAN_B)).rejects.toThrow();

      // Ключевое: до внешнего вызова дело дойти не должно, иначе ссылка на
      // чужой тариф уже уедет в Telegram и в invite_links.
      expect(channelsSvc.createInviteLink).not.toHaveBeenCalled();
    });

    it('не даёт создать ссылку на чужом канале', async () => {
      fake.queue([{ clientId: CLIENT_B }]);

      await expect(
        service.createInviteLink(CLIENT_A, CHANNEL_A),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(channelsSvc.createInviteLink).not.toHaveBeenCalled();
    });

    it('отвергает несуществующий тариф, а не пропускает его дальше', async () => {
      fake.queue([{ clientId: CLIENT_A }], []);

      await expect(
        service.createInviteLink(CLIENT_A, CHANNEL_A, 'нет-такого'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(channelsSvc.createInviteLink).not.toHaveBeenCalled();
    });

    it('без тарифа проверяется только канал', async () => {
      fake.queue([{ clientId: CLIENT_A }]);

      await expect(service.createInviteLink(CLIENT_A, CHANNEL_A)).resolves.toEqual({
        url: 'https://t.me/+link',
      });
      expect(channelsSvc.createInviteLink).toHaveBeenCalledWith(CHANNEL_A, undefined);
    });
  });

  describe('deletePlan', () => {
    it('не даёт удалить чужой тариф', async () => {
      fake.queue([{ id: PLAN_B, clientId: CLIENT_B }]);

      await expect(service.deletePlan(CLIENT_A, PLAN_B)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('отвергает несуществующий тариф', async () => {
      fake.queue([]);
      await expect(service.deletePlan(CLIENT_A, 'нет-такого')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setPayment', () => {
    it('отвергает неизвестного провайдера', async () => {
      await expect(
        service.setPayment(CLIENT_A, 'ссылка-на-мошенника', { apiKey: 'k' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['yookassa', 'cloudpayments', 'robokassa', 'prodamus', 'stars'])(
      'принимает известного провайдера %s',
      async (provider) => {
        const box = { encrypt: vi.fn().mockReturnValue('enc') };
        const created = createFakeDb();
        const svc = new CabinetService(
          created.db,
          box as never,
          {} as never,
          {} as never,
          channelsSvc as never,
        );
        created.fake.queue([], []);

        await expect(svc.setPayment(CLIENT_A, provider, { apiKey: 'k' })).resolves.toEqual({
          ok: true,
        });
      },
    );

    it('шифрует ключи перед записью и не кладёт их открыто', async () => {
      const box = { encrypt: vi.fn().mockReturnValue('зашифровано') };
      const created = createFakeDb();
      const svc = new CabinetService(
        created.db,
        box as never,
        {} as never,
        {} as never,
        channelsSvc as never,
      );
      created.fake.queue([], []);

      await svc.setPayment(CLIENT_A, 'prodamus', { apiKey: 'секрет', secretKey: 'секрет2' });

      expect(box.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ apiKey: 'секрет', secretKey: 'секрет2' }),
      );
      const [values] = created.fake.argsOf('values') as [Record<string, unknown>];
      expect(values.credentialsEnc).toBe('зашифровано');
      expect(JSON.stringify(values)).not.toContain('секрет');
    });

    it('для stars ключи не хранит вовсе', async () => {
      const box = { encrypt: vi.fn() };
      const created = createFakeDb();
      const svc = new CabinetService(
        created.db,
        box as never,
        {} as never,
        {} as never,
        channelsSvc as never,
      );
      created.fake.queue([], []);

      await svc.setPayment(CLIENT_A, 'stars', { apiKey: 'не-нужен' });

      expect(box.encrypt).not.toHaveBeenCalled();
      const [values] = created.fake.argsOf('values') as [Record<string, unknown>];
      expect(values.credentialsEnc).toBeNull();
    });
  });

  describe('listPayments', () => {
    it('не отдаёт наружу зашифрованные ключи', async () => {
      fake.queue([{ provider: 'prodamus', isActive: true }]);

      const rows = await service.listPayments(CLIENT_A);

      expect(rows.every((r) => !('credentialsEnc' in r))).toBe(true);
      expect(JSON.stringify(rows)).not.toContain('credentials');
    });
  });
});
