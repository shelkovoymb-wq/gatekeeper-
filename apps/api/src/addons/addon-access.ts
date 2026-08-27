/**
 * Гейт платной опции.
 *
 * Решение — чистая функция: её видно глазами и она покрыта тестами. Доступ к
 * оплаченному не то место, где можно однажды ошибиться в одной из десяти
 * проверок по месту.
 *
 * Модель и правила — из скилла prodamus-subscription
 * (.claude/skills/prodamus-subscription/references/data-model.md).
 */

export const ADDON_STATUSES = ['free', 'trial', 'active', 'past_due', 'expired'] as const;
export type AddonStatus = (typeof ADDON_STATUSES)[number];

export function isAddonStatus(value: string): value is AddonStatus {
  return (ADDON_STATUSES as readonly string[]).includes(value);
}

/**
 * Есть ли доступ к опции.
 *
 * free     — выдан вручную (подарок, свои): дата не проверяется.
 * trial    — пробный период, строго по дате.
 * active   — оплачен, по дате. Без даты считаем открытым: так выглядит ручная
 *            активация владельцем, и это осознанная воля человека.
 * past_due — списание не прошло, шлюз повторяет. **Отсрочки нет**: доступ ровно
 *            до expires_at. Безусловный доступ здесь однажды подарил клиентам
 *            месяцы бесплатной работы — шлюз не всегда присылает финальное
 *            событие, и подписка зависает в past_due навсегда. Без даты это
 *            сломанное состояние, доступа не даём.
 * expired  — доступа нет.
 */
export function hasAddonAccess(
  status: string | null | undefined,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!status) return false;
  if (status === 'free') return true;

  if (status === 'active' || status === 'past_due' || status === 'trial') {
    if (!expiresAt) return status === 'active';
    const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(exp.getTime())) return false;
    return now < exp;
  }

  return false;
}

/** Сколько дней осталось; null — если срок не задан или уже вышел. */
export function daysLeft(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!expiresAt) return null;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return null;
  const ms = exp.getTime() - now.getTime();
  if (ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

/**
 * Новый срок при успешной оплате: max(текущий, now + период).
 * Активация не должна СРЕЗАТЬ уже оплаченный вперёд срок.
 */
export function extendedExpiry(
  currentExpiry: Date | string | null | undefined,
  periodDays: number,
  now: Date = new Date(),
): Date {
  const base = (() => {
    if (!currentExpiry) return now;
    const cur = currentExpiry instanceof Date ? currentExpiry : new Date(currentExpiry);
    if (Number.isNaN(cur.getTime())) return now;
    return cur > now ? cur : now;
  })();
  return new Date(base.getTime() + periodDays * 86_400_000);
}
