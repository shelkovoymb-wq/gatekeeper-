import { describe, it, expect } from 'vitest';
import {
  addDays,
  autoGranularity,
  bucketLabel,
  clampLimit,
  daysBetween,
  fillBuckets,
  money,
  parseDate,
  resolvePeriod,
  share,
  startOfBucket,
  toNum,
} from './analytics.util.js';

const NOW = new Date('2026-08-16T10:30:00.000Z');

describe('parseDate', () => {
  it('принимает корректную ISO-дату', () => {
    expect(parseDate('2026-02-28')).toBe('2026-02-28');
  });

  it.each(['2026-02-30', '16.08.2026', '2026-8-1', '', null, 42])(
    'отвергает мусор %s',
    (value) => {
      expect(parseDate(value)).toBeNull();
    },
  );
});

describe('resolvePeriod', () => {
  it('по умолчанию — последние 30 дней по сегодняшний включительно', () => {
    const p = resolvePeriod({}, NOW);
    expect(p).toMatchObject({
      from: '2026-07-18',
      to: '2026-08-16',
      toExclusive: '2026-08-17',
      days: 30,
      granularity: 'day',
    });
  });

  it('разворачивает перевёрнутый период', () => {
    const p = resolvePeriod({ from: '2026-08-10', to: '2026-08-01' }, NOW);
    expect(p.from).toBe('2026-08-01');
    expect(p.to).toBe('2026-08-10');
  });

  it('игнорирует невалидные даты и откатывается к умолчанию', () => {
    const p = resolvePeriod({ from: 'вчера', to: '2026-08-16' }, NOW);
    expect(p.from).toBe('2026-07-18');
  });

  it('уважает явную детализацию', () => {
    expect(resolvePeriod({ from: '2026-08-01', to: '2026-08-10', granularity: 'month' }, NOW)
      .granularity).toBe('month');
  });

  it('огрубляет детализацию, если корзин было бы слишком много', () => {
    const p = resolvePeriod({ from: '2016-01-01', to: '2026-01-01', granularity: 'day' }, NOW);
    expect(p.granularity).toBe('month');
  });

  it('подбирает детализацию по длине периода', () => {
    expect(autoGranularity(30)).toBe('day');
    expect(autoGranularity(180)).toBe('week');
    expect(autoGranularity(1000)).toBe('month');
  });
});

describe('корзины времени', () => {
  it('неделя начинается с понедельника, как date_trunc в Postgres', () => {
    expect(startOfBucket('2026-08-16', 'week')).toBe('2026-08-10'); // воскресенье → пн той же недели
    expect(startOfBucket('2026-08-10', 'week')).toBe('2026-08-10');
  });

  it('месяц схлопывается к первому числу', () => {
    expect(startOfBucket('2026-08-16', 'month')).toBe('2026-08-01');
  });

  it('подписи читаются человеком', () => {
    expect(bucketLabel('2026-08-16', 'day')).toBe('16.08');
    expect(bucketLabel('2026-08-10', 'week')).toBe('10 авг');
    expect(bucketLabel('2026-08-01', 'month')).toBe('авг 2026');
  });

  it('arithmetic по датам не уезжает через границу месяца', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(daysBetween('2026-08-01', '2026-09-01')).toBe(31);
  });
});

describe('fillBuckets', () => {
  const period = resolvePeriod({ from: '2026-08-01', to: '2026-08-05' }, NOW);
  const empty = { turnover: 0, paymentsCount: 0 };

  it('достраивает дни без платежей нулями', () => {
    const out = fillBuckets(period, [{ bucket: '2026-08-03', turnover: 500, paymentsCount: 2 }], empty);
    expect(out).toHaveLength(5);
    expect(out.map((b) => b.turnover)).toEqual([0, 0, 500, 0, 0]);
    expect(out[0].label).toBe('01.08');
  });

  it('складывает строки, попавшие в одну корзину', () => {
    const monthly = resolvePeriod({ from: '2026-08-01', to: '2026-08-31', granularity: 'month' }, NOW);
    const out = fillBuckets(
      monthly,
      [
        { bucket: '2026-08-03', turnover: 100, paymentsCount: 1 },
        { bucket: '2026-08-20', turnover: 250, paymentsCount: 3 },
      ],
      empty,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ turnover: 350, paymentsCount: 4 });
  });

  it('переваривает timestamp вместо даты в bucket', () => {
    const out = fillBuckets(
      period,
      [{ bucket: '2026-08-02T00:00:00.000Z', turnover: 10, paymentsCount: 1 }],
      empty,
    );
    expect(out[1].turnover).toBe(10);
  });
});

describe('числовые помощники', () => {
  it('clampLimit держит выборку в границах', () => {
    expect(clampLimit(undefined, 500, 20_000)).toBe(500);
    expect(clampLimit('0', 500, 20_000)).toBe(500);
    expect(clampLimit('нет', 500, 20_000)).toBe(500);
    expect(clampLimit('100000', 500, 20_000)).toBe(20_000);
    expect(clampLimit('120.7', 500, 20_000)).toBe(120);
  });

  it('toNum не пропускает NaN', () => {
    expect(toNum('12.30')).toBe(12.3);
    expect(toNum(null)).toBe(0);
    expect(toNum('abc')).toBe(0);
  });

  it('money округляет до копеек', () => {
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(money(1234.5678)).toBe(1234.57);
  });

  it('share не делит на ноль', () => {
    expect(share(25, 200)).toBe(12.5);
    expect(share(5, 0)).toBe(0);
  });
});
