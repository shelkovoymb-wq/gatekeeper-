/**
 * Чистые утилиты аналитики платформы: разбор периода, раскладка по корзинам
 * времени, приведение numeric-строк Postgres к числам.
 *
 * Вынесены отдельно от сервиса, чтобы правила периода можно было проверить
 * тестами без Postgres.
 */

export type Granularity = 'day' | 'week' | 'month';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRANULARITIES: Granularity[] = ['day', 'week', 'month'];
const MONTHS_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** Больше корзин на графике не рисуем — иначе он нечитаем, а ответ раздут. */
const MAX_BUCKETS = 400;
/** Период по умолчанию, если фильтр не задан. */
const DEFAULT_DAYS = 30;

export interface ResolvedPeriod {
  /** Начало периода включительно, YYYY-MM-DD. */
  from: string;
  /** Конец периода включительно, YYYY-MM-DD. */
  to: string;
  /** Эксклюзивная верхняя граница для SQL (`created_at < toExclusive`). */
  toExclusive: string;
  granularity: Granularity;
  /** Длина периода в днях (включительно). */
  days: number;
}

export interface PeriodQuery {
  from?: string;
  to?: string;
  granularity?: string;
}

/** ISO-дата (YYYY-MM-DD) или null, если строка не является календарной датой. */
export function parseDate(value: unknown): string | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return null;
  // Отсекаем «31 февраля»: после парсинга дата обязана совпасть с исходной.
  return new Date(ms).toISOString().slice(0, 10) === value ? value : null;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function atUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: string, n: number): string {
  const d = atUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIsoDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((atUtc(to).getTime() - atUtc(from).getTime()) / 86_400_000);
}

/** Начало корзины: сам день, понедельник недели или первое число месяца. */
export function startOfBucket(iso: string, granularity: Granularity): string {
  const d = atUtc(iso);
  if (granularity === 'month') {
    return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  }
  if (granularity === 'week') {
    // ISO-неделя, как date_trunc('week') в Postgres: начинается с понедельника.
    const shift = (d.getUTCDay() + 6) % 7;
    return addDays(iso, -shift);
  }
  return iso;
}

/** Начало следующей корзины. */
export function nextBucket(iso: string, granularity: Granularity): string {
  if (granularity === 'month') {
    const d = atUtc(iso);
    return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
  }
  return addDays(iso, granularity === 'week' ? 7 : 1);
}

/** Человеческая подпись корзины для оси графика. */
export function bucketLabel(iso: string, granularity: Granularity): string {
  const d = atUtc(iso);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS_RU[d.getUTCMonth()];
  if (granularity === 'month') return `${mon} ${d.getUTCFullYear()}`;
  if (granularity === 'week') return `${dd} ${mon}`;
  return `${dd}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Сколько корзин уместится в периоде при данной детализации. */
export function bucketCount(period: { from: string; to: string }, granularity: Granularity): number {
  let cursor = startOfBucket(period.from, granularity);
  const end = period.to;
  let n = 0;
  while (cursor <= end && n <= MAX_BUCKETS + 1) {
    n += 1;
    cursor = nextBucket(cursor, granularity);
  }
  return n;
}

/** Детализация по длине периода: до 62 дней — дни, до года — недели, дальше — месяцы. */
export function autoGranularity(days: number): Granularity {
  if (days <= 62) return 'day';
  if (days <= 370) return 'week';
  return 'month';
}

/**
 * Приводит query-параметры к валидному периоду.
 * По умолчанию — последние 30 дней. Даты вне формата игнорируются,
 * перевёрнутый период разворачивается, слишком дробная детализация огрубляется.
 */
export function resolvePeriod(query: PeriodQuery = {}, now: Date = new Date()): ResolvedPeriod {
  const today = toIsoDate(now);
  let from = parseDate(query.from);
  let to = parseDate(query.to) ?? today;
  if (!from) from = addDays(to, -(DEFAULT_DAYS - 1));
  if (from > to) [from, to] = [to, from];

  const days = daysBetween(from, to) + 1;
  const asked = GRANULARITIES.find((g) => g === query.granularity);
  let granularity = asked ?? autoGranularity(days);
  // Явная детализация не должна взрывать график: огрубляем до разумной.
  while (granularity !== 'month' && bucketCount({ from, to }, granularity) > MAX_BUCKETS) {
    granularity = granularity === 'day' ? 'week' : 'month';
  }

  return { from, to, toExclusive: addDays(to, 1), granularity, days };
}

/** Ограничение размера выборки: положительное целое в пределах [1, max]. */
export function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** numeric/bigint из Postgres приходят строками — приводим к числу без NaN. */
export function toNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Округление денег до копеек (защита от 0.1 + 0.2). */
export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Доля в процентах с одним знаком; 0, если база пустая. */
export function share(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Достраивает пропущенные корзины нулями, чтобы график не «схлопывался»
 * на днях без платежей, и добавляет подписи оси.
 */
export function fillBuckets<T extends Record<string, number>>(
  period: ResolvedPeriod,
  rows: Array<{ bucket: string } & Partial<T>>,
  empty: T,
): Array<{ bucket: string; label: string } & T> {
  const byBucket = new Map<string, Partial<T>>();
  for (const row of rows) {
    const key = startOfBucket(String(row.bucket).slice(0, 10), period.granularity);
    const prev = byBucket.get(key);
    if (!prev) {
      byBucket.set(key, row);
      continue;
    }
    // Две строки в одной корзине (например, при огрублении детализации) — складываем.
    const merged: Record<string, number> = { ...prev } as Record<string, number>;
    for (const field of Object.keys(empty)) {
      merged[field] = toNum(prev[field as keyof T]) + toNum(row[field as keyof T]);
    }
    byBucket.set(key, merged as Partial<T>);
  }

  const out: Array<{ bucket: string; label: string } & T> = [];
  let cursor = startOfBucket(period.from, period.granularity);
  while (cursor <= period.to && out.length < MAX_BUCKETS) {
    const hit = byBucket.get(cursor);
    const values = {} as T;
    for (const field of Object.keys(empty) as Array<keyof T>) {
      values[field] = (hit ? toNum(hit[field]) : empty[field]) as T[keyof T];
    }
    out.push({ bucket: cursor, label: bucketLabel(cursor, period.granularity), ...values });
    cursor = nextBucket(cursor, period.granularity);
  }
  return out;
}
