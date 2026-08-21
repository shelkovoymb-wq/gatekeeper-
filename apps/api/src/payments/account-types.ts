/**
 * Типы реквизитов для приёма денег — общие для владельца платформы и клиентов.
 *
 * Списки живут здесь, а не в каждом сервисе: реквизиты заводятся в двух местах
 * (`OwnerPayoutsService` и `CabinetService`), хранятся в двух таблицах и
 * рисуются двумя экранами. Пока список был скопирован в каждое из них,
 * «набор типов у всех одинаковый» держалось на комментарии — добавленный
 * владельцу тип молча не доезжал до кабинета.
 */
export const PAYMENT_ACCOUNT_TYPES = ['bank_account', 'card', 'sbp', 'paypal', 'crypto'] as const;
export type PaymentAccountType = (typeof PAYMENT_ACCOUNT_TYPES)[number];

/** Сети, в которых принимаем криптовалюту. */
export const CRYPTO_TYPES = ['btc', 'eth', 'usdt'] as const;
export type CryptoType = (typeof CRYPTO_TYPES)[number];

export function isPaymentAccountType(value: string): value is PaymentAccountType {
  return (PAYMENT_ACCOUNT_TYPES as readonly string[]).includes(value);
}

export function isCryptoType(value: string): value is CryptoType {
  return (CRYPTO_TYPES as readonly string[]).includes(value);
}

/**
 * Наружу отдаём только хвост номера счёта. Правило одно на обе таблицы:
 * пока маскирование было переписано в каждом сервисе, изменить его в одном
 * месте означало тихо оставить утечку в другом.
 */
export function maskAccountNumber(value: string | null | undefined): string | null {
  return value ? `****${value.slice(-4)}` : null;
}

/** Последние 4 цифры из маскированного номера карты; null, если их там нет. */
export function cardLast4(masked: string | null | undefined): string | null {
  return masked?.match(/(\d{4})\D*$/)?.[1] ?? null;
}
