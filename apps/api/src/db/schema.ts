/**
 * Drizzle-схема Gatekeeper. Соответствует docs/telegram-subscription-platform/03-data-model.md.
 * Мультитенантность: shared schema, tenant = client_id во всех клиентских таблицах.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  jsonb,
  bigint,
  bigserial,
  date,
  customType,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** citext — регистронезависимый text (email). Требует `CREATE EXTENSION citext`. */
const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

const nowDefault = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ─── ПЛАТФОРМЕННЫЙ УРОВЕНЬ (владелец платформы) ──────────────────────────────

export const platformPlans = pgTable('platform_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(), // free | start | pro
  name: text('name').notNull(),
  priceMonth: numeric('price_month', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('RUB'),
  commissionPct: numeric('commission_pct', { precision: 5, scale: 2 }).notNull().default('0'),
  limits: jsonb('limits').notNull().default(sql`'{}'::jsonb`),
  features: jsonb('features').notNull().default(sql`'{}'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: nowDefault(),
});

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    platformPlanId: uuid('platform_plan_id')
      .notNull()
      .references(() => platformPlans.id),
    planStatus: text('plan_status').notNull().default('trialing'),
    planPaidUntil: timestamp('plan_paid_until', { withTimezone: true }),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    createdAt: nowDefault(),
  },
  (t) => ({
    byPlan: index('clients_plan_idx').on(t.platformPlanId),
  }),
);

export const clientUsers = pgTable('client_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id), // NULL — владелец платформы
  role: text('role').notNull(), // owner | client_admin | client_staff
  email: citext('email').unique(),
  // NULL у пользователей, заведённых через Google/Яндекс: пароля у них нет.
  passwordHash: text('password_hash'),
  tgUserId: bigint('tg_user_id', { mode: 'number' }).unique(),
  // 2FA (TOTP). Секрет — в конверте SecretBox, как и токены ботов.
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  totpConfirmedAt: timestamp('totp_confirmed_at', { withTimezone: true }),
  totpBackupCodes: jsonb('totp_backup_codes').notNull().default(sql`'[]'::jsonb`),
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  createdAt: nowDefault(),
});

/** Привязки внешних аккаунтов (OAuth): google | yandex. */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => clientUsers.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: citext('email'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    createdAt: nowDefault(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => ({
    byProviderAccount: uniqueIndex('user_identities_provider_uq').on(t.provider, t.providerUserId),
    byUserProvider: uniqueIndex('user_identities_user_provider_uq').on(t.userId, t.provider),
  }),
);

export const platformInvoices = pgTable(
  'platform_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').notNull().default('pending'), // pending|paid|void|overdue
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    createdAt: nowDefault(),
  },
  (t) => ({
    byClientPeriod: uniqueIndex('platform_invoices_client_period_uq').on(
      t.clientId,
      t.periodStart,
      t.periodEnd,
    ),
    byStatus: index('platform_invoices_status_idx').on(t.status),
  }),
);

// ─── УРОВЕНЬ КЛИЕНТА ─────────────────────────────────────────────────────────

export const bots = pgTable('bots', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id),
  tgBotId: bigint('tg_bot_id', { mode: 'number' }).notNull().unique(),
  username: text('username').notNull(),
  tokenEnc: text('token_enc').notNull(), // зашифрованный токен (base64 конверта)
  webhookSecret: text('webhook_secret').notNull(),
  isPlatformBot: boolean('is_platform_bot').notNull().default(false),
  status: text('status').notNull().default('active'), // active|token_invalid|disabled
  createdAt: nowDefault(),
});

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    botId: uuid('bot_id')
      .notNull()
      .references(() => bots.id),
    tgChatId: bigint('tg_chat_id', { mode: 'number' }).notNull(),
    title: text('title').notNull(),
    type: text('type').notNull().default('channel'), // channel|group
    botStatus: text('bot_status').notNull().default('ok'), // ok|no_rights|removed
    kickPolicy: text('kick_policy').notNull().default('kick'), // kick|keep
    createdAt: nowDefault(),
  },
  (t) => ({
    uniqBotChat: uniqueIndex('channels_bot_chat_uq').on(t.botId, t.tgChatId),
    byClient: index('channels_client_idx').on(t.clientId),
  }),
);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    name: text('name').notNull(),
    description: text('description'),
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('RUB'),
    starsPrice: integer('stars_price'),
    periodDays: integer('period_days').notNull(), // 7|30|90|365; 0 = lifetime
    trialDays: integer('trial_days').notNull().default(0),
    graceDays: integer('grace_days').notNull().default(3),
    autorenew: boolean('autorenew').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: nowDefault(),
  },
  (t) => ({
    byClient: index('plans_client_idx').on(t.clientId),
  }),
);

export const planChannels = pgTable(
  'plan_channels',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.planId, t.channelId] }),
  }),
);

export const promoCodes = pgTable(
  'promo_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    planId: uuid('plan_id').references(() => plans.id), // NULL = на все тарифы
    code: text('code').notNull(),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2 }),
    bonusDays: integer('bonus_days'),
    maxUses: integer('max_uses'),
    usedCount: integer('used_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => ({
    uniqCode: uniqueIndex('promo_client_code_uq').on(t.clientId, t.code),
  }),
);

export const paymentConfigs = pgTable(
  'payment_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    provider: text('provider').notNull(), // yookassa|cloudpayments|stars|cryptobot
    credentialsEnc: text('credentials_enc'), // зашифровано; для stars NULL
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => ({
    uniqProvider: uniqueIndex('payment_configs_client_provider_uq').on(t.clientId, t.provider),
  }),
);

export const directPaymentAccounts = pgTable(
  'direct_payment_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    accountType: text('account_type').notNull(), // card|bank_account|sbp|paypal|crypto
    cardNumberMasked: text('card_number_masked'), // ****1234 — полного номера не храним
    cardHolder: text('card_holder'),
    bankName: text('bank_name'),
    accountNumber: text('account_number'),
    bic: text('bic'),
    inn: text('inn'),
    phoneNumber: text('phone_number'),
    email: text('email'), // PayPal
    phoneForSbp: text('phone_for_sbp'),
    cryptoAddress: text('crypto_address'),
    cryptoType: text('crypto_type'), // btc|eth|usdt
    isActive: boolean('is_active').notNull().default(true),
    verificationStatus: text('verification_status').notNull().default('unverified'), // unverified|pending|verified|rejected
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: nowDefault(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byClient: index('direct_payment_accounts_client_idx').on(t.clientId),
    byStatus: index('direct_payment_accounts_status_idx').on(t.verificationStatus),
  }),
);

// ─── ПОДПИСЧИКИ И ПОДПИСКИ ────────────────────────────────────────────────────

export const subscribers = pgTable('subscribers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tgUserId: bigint('tg_user_id', { mode: 'number' }).notNull().unique(),
  username: text('username'),
  firstName: text('first_name'),
  language: text('language'),
  isReachable: boolean('is_reachable').notNull().default(true),
  createdAt: nowDefault(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: text('status').notNull(), // trial|active|grace|expired|churned|banned
    paidUntil: timestamp('paid_until', { withTimezone: true }),
    graceUntil: timestamp('grace_until', { withTimezone: true }),
    autorenew: boolean('autorenew').notNull().default(true),
    provider: text('provider'),
    providerMethodId: text('provider_method_id'),
    source: text('source'),
    isGift: boolean('is_gift').notNull().default(false),
    createdAt: nowDefault(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqSubPlan: uniqueIndex('subscriptions_subscriber_plan_uq').on(t.subscriberId, t.planId),
    byClientStatus: index('subscriptions_client_status_idx').on(t.clientId, t.status),
    reaperIdx: index('subscriptions_status_paid_idx').on(t.status, t.paidUntil), // для reaper
  }),
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
    subscriberId: uuid('subscriber_id').references(() => subscribers.id),
    provider: text('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(), // pending|succeeded|failed|refunded
    kind: text('kind').notNull().default('purchase'), // purchase|renewal|refund
    // Кто перевёл платёж в succeeded: null — провайдер (подписанный вебхук либо
    // встречный запрос в его API), 'client' — клиент отметил в кабинете, что
    // деньги пришли на его реквизиты. Второе учитывается в обороте отдельно.
    confirmedBy: text('confirmed_by'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    raw: jsonb('raw'),
    metadata: jsonb('metadata'),
    createdAt: nowDefault(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqProviderPayment: uniqueIndex('payments_provider_payment_uq').on(
      t.provider,
      t.providerPaymentId,
    ), // идемпотентность вебхуков
    byClientCreated: index('payments_client_created_idx').on(t.clientId, t.createdAt),
  }),
);

export const subscriptionEvents = pgTable('subscription_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  event: text('event').notNull(),
  actor: text('actor').notNull().default('system'),
  payload: jsonb('payload'),
  createdAt: nowDefault(),
});

// ─── ДОСТУП В КАНАЛЫ ──────────────────────────────────────────────────────────

export const inviteLinks = pgTable('invite_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  channelId: uuid('channel_id')
    .notNull()
    .references(() => channels.id),
  planId: uuid('plan_id').references(() => plans.id),
  url: text('url').notNull(),
  kind: text('kind').notNull().default('join_request'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: nowDefault(),
});

export const channelMembers = pgTable(
  'channel_members',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id),
    subscriberId: uuid('subscriber_id')
      .notNull()
      .references(() => subscribers.id),
    status: text('status').notNull(), // member|left|kicked|unauthorized
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.channelId, t.subscriberId] }),
  }),
);

// ─── СОБЫТИЯ / ИНТЕГРАЦИИ ─────────────────────────────────────────────────────

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clientId: uuid('client_id'),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('new'), // new|delivered|failed
    attempts: integer('attempts').notNull().default(0),
    createdAt: nowDefault(),
  },
  (t) => ({
    dispatchIdx: index('outbox_status_id_idx').on(t.status, t.id),
  }),
);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  clientId: uuid('client_id'),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  payload: jsonb('payload'),
  createdAt: nowDefault(),
});

// ─── ПЛАТЕЖНЫЕ РЕКВИЗИТЫ ВЛАДЕЛЬЦА ────────────────────────────────────────────

export const ownerPaymentAccounts = pgTable(
  'owner_payment_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountType: text('account_type').notNull(), // bank_account|card|sbp|paypal|crypto
    provider: text('provider'), // yookassa|prodamus|manual|cryptobot
    // Банковские реквизиты
    bankName: text('bank_name'),
    accountNumber: text('account_number'),
    bic: text('bic'),
    inn: text('inn'),
    // СБП
    phoneSbp: text('phone_sbp'),
    // PayPal
    paypalEmail: text('paypal_email'),
    // Крипто
    cryptoAddress: text('crypto_address'),
    cryptoType: text('crypto_type'), // btc|eth|usdt
    // Карта (only last 4 for PCI compliance)
    cardLast4: text('card_last4'),
    cardHolder: text('card_holder'),
    // Статусы
    isActive: boolean('is_active').notNull().default(true),
    verificationStatus: text('verification_status').notNull().default('pending'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    credentialsEnc: text('credentials_enc'), // зашифрованные реквизиты
    // Доп. реквизиты
    bankCode: text('bank_code'),
    sortCode: text('sort_code'),
    swiftCode: text('swift_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('owner_payment_accounts_active_idx').on(t.isActive, t.verificationStatus),
    typeIdx: index('owner_payment_accounts_type_idx').on(t.accountType),
  }),
);

export const ownerPayouts = pgTable(
  'owner_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ownerPaymentAccounts.id),
    invoiceIds: text('invoice_ids').notNull(), // JSON array of platform_invoice IDs
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('RUB'),
    status: text('status').notNull().default('pending'), // pending|processing|completed|failed|cancelled
    providerPayoutId: text('provider_payout_id'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('owner_payouts_status_idx').on(t.status, t.createdAt),
    accountIdx: index('owner_payouts_account_idx').on(t.accountId),
  }),
);

export const ownerPayoutEvents = pgTable('owner_payout_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  payoutId: uuid('payout_id')
    .notNull()
    .references(() => ownerPayouts.id),
  event: text('event').notNull(), // initiated|processing|completed|failed|cancelled
  details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
