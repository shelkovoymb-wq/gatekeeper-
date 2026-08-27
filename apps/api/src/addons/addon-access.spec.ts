import { describe, it, expect } from 'vitest';
import { hasAddonAccess, daysLeft, extendedExpiry } from './addon-access.js';

const NOW = new Date('2026-08-26T12:00:00Z');
const FUTURE = new Date('2026-09-26T12:00:00Z');
const PAST = new Date('2026-08-01T12:00:00Z');

describe('Гейт платной опции', () => {
  describe('hasAddonAccess', () => {
    it('free — доступ всегда, дата не проверяется', () => {
      expect(hasAddonAccess('free', null, NOW)).toBe(true);
      expect(hasAddonAccess('free', PAST, NOW)).toBe(true);
    });

    it('active — по дате', () => {
      expect(hasAddonAccess('active', FUTURE, NOW)).toBe(true);
      expect(hasAddonAccess('active', PAST, NOW)).toBe(false);
    });

    it('active без даты — доступ есть: так выглядит ручная активация владельцем', () => {
      expect(hasAddonAccess('active', null, NOW)).toBe(true);
    });

    it('past_due — доступ ровно до даты, отсрочки нет', () => {
      // Безусловный доступ здесь дарит месяцы бесплатной работы: шлюз не всегда
      // присылает финальное событие, и подписка зависает в past_due навсегда.
      expect(hasAddonAccess('past_due', FUTURE, NOW)).toBe(true);
      expect(hasAddonAccess('past_due', PAST, NOW)).toBe(false);
    });

    it('past_due без даты — сломанное состояние, доступа нет', () => {
      expect(hasAddonAccess('past_due', null, NOW)).toBe(false);
    });

    it('trial — строго по дате, без даты доступа нет', () => {
      expect(hasAddonAccess('trial', FUTURE, NOW)).toBe(true);
      expect(hasAddonAccess('trial', PAST, NOW)).toBe(false);
      expect(hasAddonAccess('trial', null, NOW)).toBe(false);
    });

    it('expired — доступа нет никогда', () => {
      expect(hasAddonAccess('expired', FUTURE, NOW)).toBe(false);
    });

    it('нет подписки вовсе — доступа нет', () => {
      expect(hasAddonAccess(null, null, NOW)).toBe(false);
      expect(hasAddonAccess(undefined, FUTURE, NOW)).toBe(false);
    });

    it('битая дата не открывает доступ', () => {
      expect(hasAddonAccess('active', 'не-дата', NOW)).toBe(false);
    });

    it('неизвестный статус не открывает доступ', () => {
      expect(hasAddonAccess('чтототам', FUTURE, NOW)).toBe(false);
    });

    it('момент истечения — доступа уже нет', () => {
      expect(hasAddonAccess('active', NOW, NOW)).toBe(false);
    });
  });

  describe('extendedExpiry', () => {
    it('продлевает от текущего срока, не срезая оплаченное вперёд', () => {
      // Оплачено до 26 сентября, платят ещё за 31 день — новый срок 27 октября,
      // а не «сегодня + 31».
      expect(extendedExpiry(FUTURE, 31, NOW).toISOString()).toBe('2026-10-27T12:00:00.000Z');
    });

    it('от сегодняшнего дня, если срок уже вышел', () => {
      expect(extendedExpiry(PAST, 31, NOW).toISOString()).toBe('2026-09-26T12:00:00.000Z');
    });

    it('от сегодняшнего дня при первой оплате', () => {
      expect(extendedExpiry(null, 31, NOW).toISOString()).toBe('2026-09-26T12:00:00.000Z');
    });

    it('битая дата не ломает продление', () => {
      expect(extendedExpiry('мусор', 31, NOW).toISOString()).toBe('2026-09-26T12:00:00.000Z');
    });
  });

  describe('daysLeft', () => {
    it('считает остаток в днях', () => {
      expect(daysLeft(FUTURE, NOW)).toBe(31);
    });

    it('null, когда срок вышел или не задан', () => {
      expect(daysLeft(PAST, NOW)).toBeNull();
      expect(daysLeft(null, NOW)).toBeNull();
      expect(daysLeft('мусор', NOW)).toBeNull();
    });
  });
});
