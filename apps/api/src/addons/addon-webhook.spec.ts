import { describe, it, expect } from 'vitest';
import { amountOf, eventKeyOf, eventTypeOf, parseOrderNum } from './addon-webhook.js';

const CLIENT = '11111111-1111-1111-1111-111111111111';

describe('order_num', () => {
  it('разбирается на клиента и опцию', () => {
    expect(parseOrderNum(`${CLIENT}:posting`)).toEqual({ clientId: CLIENT, addonCode: 'posting' });
  });

  it('без опции — клиент всё равно найден', () => {
    expect(parseOrderNum(CLIENT)).toEqual({ clientId: CLIENT, addonCode: null });
  });

  it('пусто или не строка — null', () => {
    expect(parseOrderNum('')).toBeNull();
    expect(parseOrderNum('   ')).toBeNull();
    expect(parseOrderNum(undefined)).toBeNull();
    expect(parseOrderNum(42)).toBeNull();
  });
});

describe('Тип события', () => {
  it('успешная оплата', () => {
    expect(eventTypeOf({ payment_status: 'success' })).toBe('payment.success');
    expect(eventTypeOf({ payment_status: 'PAID' })).toBe('payment.success');
  });

  it('неудачное списание', () => {
    expect(eventTypeOf({ payment_status: 'failed' })).toBe('payment.failed');
    expect(eventTypeOf({ payment_status: 'canceled' })).toBe('payment.failed');
  });

  it('отключение подписки — по action_code и по active=0', () => {
    expect(eventTypeOf({ subscription: { action_code: 'deactivation' } })).toBe(
      'subscription.deactivated',
    );
    expect(eventTypeOf({ subscription: { active: '0' } })).toBe('subscription.deactivated');
  });

  it('активная подписка с успешной оплатой — это оплата, а не отключение', () => {
    expect(eventTypeOf({ subscription: { active: '1' }, payment_status: 'success' })).toBe(
      'payment.success',
    );
  });

  it('незнакомое состояние — unknown, подписку не трогаем', () => {
    expect(eventTypeOf({ payment_status: 'pending' })).toBe('unknown');
    expect(eventTypeOf({})).toBe('unknown');
  });
});

describe('Сумма', () => {
  it('строка и число', () => {
    expect(amountOf({ sum: '490.00' })).toBe(490);
    expect(amountOf({ sum: 490 })).toBe(490);
  });

  it('запятая как разделитель', () => {
    expect(amountOf({ sum: '490,50' })).toBe(490.5);
  });

  it('мусор — ноль: такая сумма не пройдёт порог активации', () => {
    expect(amountOf({ sum: 'много' })).toBe(0);
    expect(amountOf({})).toBe(0);
  });
});

describe('Ключ идемпотентности', () => {
  const body = {
    order_num: `${CLIENT}:posting`,
    order_id: '777',
    sum: '490.00',
    date: '2026-08-26T12:00:00+03:00',
    payment_status: 'success',
  };

  it('одинаковый у повторной доставки того же события', () => {
    expect(eventKeyOf(body, 'payment.success')).toBe(eventKeyOf({ ...body }, 'payment.success'));
  });

  it('разный у следующего платежа', () => {
    const next = { ...body, order_id: '778', date: '2026-09-26T12:00:00+03:00' };
    expect(eventKeyOf(next, 'payment.success')).not.toBe(eventKeyOf(body, 'payment.success'));
  });

  it('разный у другого типа события с теми же полями', () => {
    expect(eventKeyOf(body, 'payment.failed')).not.toBe(eventKeyOf(body, 'payment.success'));
  });

  it('сумма нормализуется: 490 и «490.00» — одно событие', () => {
    expect(eventKeyOf({ ...body, sum: 490 }, 'payment.success')).toBe(
      eventKeyOf(body, 'payment.success'),
    );
  });
});
