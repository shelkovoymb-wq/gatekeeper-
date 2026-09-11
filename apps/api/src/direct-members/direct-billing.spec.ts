import { describe, it, expect } from 'vitest';
import {
  billableBase,
  commissionOf,
  periodMonth,
  summarizeDirect,
  type DirectRow,
} from './direct-billing.js';

describe('Период', () => {
  it('первое число месяца по UTC', () => {
    expect(periodMonth(new Date('2026-09-11T22:30:00Z'))).toBe('2026-09-01');
    expect(periodMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('конец месяца в поздний час не уезжает в следующий месяц', () => {
    // Локальное время сервера тут ни при чём: ключ периода считается по UTC.
    expect(periodMonth(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09-01');
  });
});

describe('База начисления по строке', () => {
  it('оформленный — сумма со слов клиента', () => {
    expect(billableBase({ status: 'declared', declaredAmount: '1500.00', fallbackPrice: 990 })).toBe(
      1500,
    );
  });

  it('неоформленный — цена тарифа: молчание не должно быть выгоднее оформления', () => {
    expect(billableBase({ status: 'pending', declaredAmount: null, fallbackPrice: 990 })).toBe(990);
  });

  it('отклонённый как «не продажа» — ноль', () => {
    expect(billableBase({ status: 'dismissed', declaredAmount: '5000', fallbackPrice: 990 })).toBe(
      0,
    );
  });

  it('оформленный без суммы падает на цену тарифа', () => {
    expect(billableBase({ status: 'declared', declaredAmount: null, fallbackPrice: 990 })).toBe(990);
    expect(billableBase({ status: 'declared', declaredAmount: '', fallbackPrice: 990 })).toBe(990);
  });

  it('нулевая сумма со слов принимается как ноль — это подарок, а не молчание', () => {
    expect(billableBase({ status: 'declared', declaredAmount: 0, fallbackPrice: 990 })).toBe(0);
  });

  it('отрицательная и нечисловая сумма не проходят: база из тарифа', () => {
    expect(billableBase({ status: 'declared', declaredAmount: -100, fallbackPrice: 990 })).toBe(990);
    expect(billableBase({ status: 'declared', declaredAmount: 'много', fallbackPrice: 990 })).toBe(
      990,
    );
  });

  it('запятая как разделитель понимается', () => {
    expect(billableBase({ status: 'declared', declaredAmount: '1500,50' })).toBe(1500.5);
  });

  it('нет ни суммы, ни тарифа — ноль, а не падение', () => {
    expect(billableBase({ status: 'pending' })).toBe(0);
  });
});

describe('Комиссия', () => {
  it('считается и округляется до копеек', () => {
    expect(commissionOf(1000, 10)).toBe(100);
    expect(commissionOf(999, 7.5)).toBe(74.93);
  });

  it('нулевые и отрицательные входы дают ноль', () => {
    expect(commissionOf(0, 10)).toBe(0);
    expect(commissionOf(1000, 0)).toBe(0);
    expect(commissionOf(-500, 10)).toBe(0);
    expect(commissionOf(1000, -5)).toBe(0);
  });
});

describe('Итог по периоду', () => {
  const rows: DirectRow[] = [
    { status: 'declared', declaredAmount: '1000', fallbackPrice: 990 },
    { status: 'declared', declaredAmount: '500', fallbackPrice: 990 },
    { status: 'pending', fallbackPrice: 990 },
    { status: 'dismissed', fallbackPrice: 990 },
  ];

  it('разделяет оформленных, неоформленных и отклонённых', () => {
    const s = summarizeDirect(rows, 10);
    expect(s.total).toBe(4);
    expect(s.declared).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.dismissed).toBe(1);
  });

  it('база складывается без отклонённых', () => {
    const s = summarizeDirect(rows, 10);
    expect(s.base).toBe(2490); // 1000 + 500 + 990
    expect(s.baseSelfReported).toBe(1500);
    expect(s.baseFromTariff).toBe(990);
  });

  it('владельцу видно, какая часть базы держится на слове клиента', () => {
    const s = summarizeDirect(rows, 10);
    expect(s.baseSelfReported + s.baseFromTariff).toBe(s.base);
  });

  it('комиссия берётся со всей базы', () => {
    expect(summarizeDirect(rows, 10).commission).toBe(249);
  });

  it('пустой период — нули, а не NaN', () => {
    const s = summarizeDirect([], 10);
    expect(s).toMatchObject({ total: 0, base: 0, commission: 0 });
  });

  it('все отклонены — начислять нечего', () => {
    const s = summarizeDirect([{ status: 'dismissed', fallbackPrice: 990 }], 10);
    expect(s.base).toBe(0);
    expect(s.commission).toBe(0);
  });

  it('копейки не накапливают ошибку округления', () => {
    const s = summarizeDirect(
      [
        { status: 'declared', declaredAmount: '0.10' },
        { status: 'declared', declaredAmount: '0.20' },
      ],
      10,
    );
    expect(s.base).toBe(0.3);
    expect(s.commission).toBe(0.03);
  });
});
