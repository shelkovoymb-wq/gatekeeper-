/**
 * @gatekeeper/shared — общие типы и контракты между API, воркерами и фронтендом.
 */

// ─── Статусные машины ──────────────────────────────────────────────────────

export const SubscriptionStatus = {
  Trial: 'trial',
  Active: 'active',
  Grace: 'grace',
  Expired: 'expired',
  Churned: 'churned',
  Banned: 'banned',
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const PaymentStatus = {
  Pending: 'pending',
  Succeeded: 'succeeded',
  Failed: 'failed',
  Refunded: 'refunded',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ClientPlanStatus = {
  Trialing: 'trialing',
  Active: 'active',
  PastDue: 'past_due',
  Suspended: 'suspended',
  Cancelled: 'cancelled',
} as const;
export type ClientPlanStatus =
  (typeof ClientPlanStatus)[keyof typeof ClientPlanStatus];

// ─── Платёжные провайдеры ──────────────────────────────────────────────────

export const PaymentProvider = {
  YooKassa: 'yookassa',
  CloudPayments: 'cloudpayments',
  Stars: 'stars',
  CryptoBot: 'cryptobot',
} as const;
export type PaymentProvider =
  (typeof PaymentProvider)[keyof typeof PaymentProvider];

// ─── Роли ──────────────────────────────────────────────────────────────────

export const UserRole = {
  Owner: 'owner', // владелец платформы (вы)
  ClientAdmin: 'client_admin',
  ClientStaff: 'client_staff',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ─── Доменные события (outbox → n8n / внутренние консюмеры) ─────────────────

export const EventTopic = {
  ClientRegistered: 'client.registered',
  SubscriptionActivated: 'subscription.activated',
  SubscriptionRenewed: 'subscription.renewed',
  SubscriptionExpiring: 'subscription.expiring', // T-3 / T-1 / T-0
  SubscriptionGrace: 'subscription.grace',
  SubscriptionExpired: 'subscription.expired',
  SubscriptionCancelled: 'subscription.cancelled',
  PaymentSucceeded: 'payment.succeeded',
  PaymentFailed: 'payment.failed',
  BotUnhealthy: 'bot.unhealthy',
  ReconciliationMismatch: 'reconciliation.mismatch',
  PlatformInvoiceOverdue: 'platform_invoice.overdue',
} as const;
export type EventTopic = (typeof EventTopic)[keyof typeof EventTopic];

export interface DomainEvent<T = Record<string, unknown>> {
  event_id: number;
  topic: EventTopic;
  client_id: string | null;
  payload: T;
  created_at: string;
}

// ─── Платформенные лимиты и фичи (JSONB в platform_plans) ──────────────────

export interface PlatformPlanLimits {
  bots: number;
  channels: number;
  subscribers: number;
  staff: number;
}

export interface PlatformPlanFeatures {
  white_label: boolean;
  custom_payments: boolean;
  api: boolean;
}

export const DEFAULT_PLATFORM_LIMITS: PlatformPlanLimits = {
  bots: 1,
  channels: 3,
  subscribers: 500,
  staff: 1,
};

export const DEFAULT_PLATFORM_FEATURES: PlatformPlanFeatures = {
  white_label: false,
  custom_payments: false,
  api: false,
};
