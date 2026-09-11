/**
 * Счёт за участников, которых клиент завёл в канал сам.
 *
 * Клиент вправе брать деньги напрямую — платформа этого не запрещает, но
 * берёт с такой продажи ту же комиссию, что и с платежа, прошедшего через неё.
 * Иначе «мимо платформы» становится способом не платить вовсе.
 *
 * Решения о деньгах вынесены в чистые функции: их видно глазами и они покрыты
 * тестами. По той же причине, что и гейт платной опции, — ошибиться здесь
 * означает либо недосчитать владельцу, либо выставить клиенту лишнее.
 */

export const DIRECT_STATUSES = ['pending', 'declared', 'dismissed'] as const;
export type DirectStatus = (typeof DIRECT_STATUSES)[number];

export function isDirectStatus(value: string): value is DirectStatus {
  return (DIRECT_STATUSES as readonly string[]).includes(value);
}

export interface DirectRow {
  status: string;
  /** Сколько клиент получил со своих слов. */
  declaredAmount?: string | number | null;
  /** Цена тарифа канала — база, когда клиент ничего не указал. */
  fallbackPrice?: string | number | null;
}

/** Первое число месяца по UTC — ключ периода, на который заводится строка. */
export function periodMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  // Отрицательная и нечисловая сумма — не сумма: такую строку считаем
  // неоформленной и берём базу из тарифа.
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * База для начисления по одной строке.
 *
 * dismissed — не продажа (свой сотрудник, админ, гость): ноль.
 * declared с суммой — сумма со слов клиента.
 * всё остальное — цена тарифа канала: молчание клиента не должно быть
 * выгоднее оформления, иначе оформлять никто не станет.
 */
export function billableBase(row: DirectRow): number {
  if (row.status === 'dismissed') return 0;
  const declared = row.status === 'declared' ? toAmount(row.declaredAmount) : null;
  if (declared !== null) return declared;
  return toAmount(row.fallbackPrice) ?? 0;
}

/** Комиссия платформы с базы, округление до копеек. */
export function commissionOf(base: number, pct: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(pct) || base <= 0 || pct <= 0) return 0;
  return Math.round(((base * pct) / 100) * 100) / 100;
}

export interface DirectSummary {
  /** Сколько строк всего попало в период. */
  total: number;
  /** Из них оформлено клиентом. */
  declared: number;
  /** Из них не оформлено — база взята из тарифа. */
  pending: number;
  /** Из них отклонено клиентом как «не продажа». */
  dismissed: number;
  /** Общая база начисления. */
  base: number;
  /** Часть базы, которая держится на слове клиента. */
  baseSelfReported: number;
  /** Часть базы, посчитанная по цене тарифа за неоформленных. */
  baseFromTariff: number;
  commission: number;
}

/** Итог по всем прямым добавлениям периода. */
export function summarizeDirect(rows: DirectRow[], pct: number): DirectSummary {
  let declared = 0;
  let pending = 0;
  let dismissed = 0;
  let baseSelfReported = 0;
  let baseFromTariff = 0;

  for (const row of rows) {
    if (row.status === 'dismissed') {
      dismissed += 1;
      continue;
    }
    const amount = billableBase(row);
    const fromWord = row.status === 'declared' && toAmount(row.declaredAmount) !== null;
    if (fromWord) {
      declared += 1;
      baseSelfReported += amount;
    } else {
      pending += 1;
      baseFromTariff += amount;
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const base = round(baseSelfReported + baseFromTariff);

  return {
    total: rows.length,
    declared,
    pending,
    dismissed,
    base,
    baseSelfReported: round(baseSelfReported),
    baseFromTariff: round(baseFromTariff),
    commission: commissionOf(base, pct),
  };
}
