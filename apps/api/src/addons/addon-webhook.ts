/**
 * Разбор вебхука шлюза для платных опций.
 *
 * Здесь только чистые функции: что за событие приехало, за какую опцию, на
 * какую сумму и каким ключом его запирать от повторной обработки. Всё это —
 * решения, из-за ошибки в которых теряются или задваиваются деньги, поэтому
 * они вынесены из контроллера и покрыты тестами.
 *
 * Поля — Продамуса (см. скилл prodamus-subscription).
 */

export type AddonEventType =
  | 'payment.success'
  | 'payment.failed'
  | 'subscription.deactivated'
  | 'unknown';

export interface WebhookBody {
  order_num?: string;
  order_id?: string;
  sum?: string | number;
  currency?: string;
  payment_status?: string;
  date?: string;
  customer_email?: string;
  customer_phone?: string;
  subscription?: { id?: string | number; active?: string | number; action_code?: string };
  [key: string]: unknown;
}

/**
 * order_num мы кладём в ссылку оплаты сами: `<clientId>:<addonCode>`.
 * Это единственная надёжная ниточка «этот платёж → этот клиент и эта опция»:
 * почта и телефон у людей меняются и дублируются, а сумма ничего не
 * идентифицирует — по ней продукт определять нельзя.
 */
export function parseOrderNum(raw: unknown): { clientId: string; addonCode: string | null } | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const [clientId, addonCode] = raw.trim().split(':');
  if (!clientId) return null;
  return { clientId, addonCode: addonCode || null };
}

/** Тип события по телу. Незнакомое событие — 'unknown': его пишем в журнал и не трогаем подписку. */
export function eventTypeOf(body: WebhookBody): AddonEventType {
  const sub = body.subscription;
  if (sub) {
    const code = String(sub.action_code ?? '').toLowerCase();
    const active = String(sub.active ?? '');
    if (code === 'deactivation' || active === '0') return 'subscription.deactivated';
  }

  const status = String(body.payment_status ?? '').toLowerCase();
  if (status === 'success' || status === 'paid') return 'payment.success';
  if (status === 'failed' || status === 'error' || status === 'canceled') return 'payment.failed';
  return 'unknown';
}

/** Сумма платежа. Нечисловое значение — 0: такая сумма не пройдёт порог и не активирует опцию. */
export function amountOf(body: WebhookBody): number {
  const value = Number(String(body.sum ?? '').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Ключ идемпотентности: детерминированный, из полей самого события.
 *
 * Замок стоит на UNIQUE-индексе в базе — шлюзы повторяют доставку часами, и
 * проверка «не было ли такого события минуту назад» их не ловит.
 */
export function eventKeyOf(body: WebhookBody, type: AddonEventType): string {
  return [
    body.order_num ?? '',
    body.order_id ?? '',
    type,
    amountOf(body).toFixed(2),
    body.date ?? '',
  ].join('|');
}
