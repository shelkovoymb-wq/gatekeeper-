-- Gatekeeper init migration.
-- Соответствует src/db/schema.ts. Идемпотентна на уровне расширений.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";    -- регистронезависимый email

-- ─── Платформенный уровень ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_plans (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code           text UNIQUE NOT NULL,
    name           text NOT NULL,
    price_month    numeric(12,2) NOT NULL DEFAULT 0,
    currency       text NOT NULL DEFAULT 'RUB',
    commission_pct numeric(5,2) NOT NULL DEFAULT 0,
    limits         jsonb NOT NULL DEFAULT '{}'::jsonb,
    features       jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active      boolean NOT NULL DEFAULT true,
    sort_order     integer NOT NULL DEFAULT 0,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    platform_plan_id uuid NOT NULL REFERENCES platform_plans(id),
    plan_status      text NOT NULL DEFAULT 'trialing',
    plan_paid_until  timestamptz,
    settings         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_plan_idx ON clients (platform_plan_id);

CREATE TABLE IF NOT EXISTS client_users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id     uuid REFERENCES clients(id),
    role          text NOT NULL,
    email         citext UNIQUE,
    password_hash text,
    tg_user_id    bigint UNIQUE,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_invoices (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    uuid NOT NULL REFERENCES clients(id),
    period_start date NOT NULL,
    period_end   date NOT NULL,
    amount       numeric(12,2) NOT NULL,
    status       text NOT NULL DEFAULT 'pending',
    details      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── Уровень клиента ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bots (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        uuid NOT NULL REFERENCES clients(id),
    tg_bot_id        bigint UNIQUE NOT NULL,
    username         text NOT NULL,
    token_enc        text NOT NULL,
    webhook_secret   text NOT NULL,
    is_platform_bot  boolean NOT NULL DEFAULT false,
    status           text NOT NULL DEFAULT 'active',
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   uuid NOT NULL REFERENCES clients(id),
    bot_id      uuid NOT NULL REFERENCES bots(id),
    tg_chat_id  bigint NOT NULL,
    title       text NOT NULL,
    type        text NOT NULL DEFAULT 'channel',
    bot_status  text NOT NULL DEFAULT 'ok',
    kick_policy text NOT NULL DEFAULT 'kick',
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS channels_bot_chat_uq ON channels (bot_id, tg_chat_id);
CREATE INDEX IF NOT EXISTS channels_client_idx ON channels (client_id);

CREATE TABLE IF NOT EXISTS plans (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   uuid NOT NULL REFERENCES clients(id),
    name        text NOT NULL,
    description text,
    price       numeric(12,2) NOT NULL,
    currency    text NOT NULL DEFAULT 'RUB',
    stars_price integer,
    period_days integer NOT NULL,
    trial_days  integer NOT NULL DEFAULT 0,
    grace_days  integer NOT NULL DEFAULT 3,
    autorenew   boolean NOT NULL DEFAULT true,
    is_active   boolean NOT NULL DEFAULT true,
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plans_client_idx ON plans (client_id);

CREATE TABLE IF NOT EXISTS plan_channels (
    plan_id    uuid NOT NULL REFERENCES plans(id),
    channel_id uuid NOT NULL REFERENCES channels(id),
    PRIMARY KEY (plan_id, channel_id)
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    uuid NOT NULL REFERENCES clients(id),
    plan_id      uuid REFERENCES plans(id),
    code         text NOT NULL,
    discount_pct numeric(5,2),
    bonus_days   integer,
    max_uses     integer,
    used_count   integer NOT NULL DEFAULT 0,
    expires_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS promo_client_code_uq ON promo_codes (client_id, code);

CREATE TABLE IF NOT EXISTS payment_configs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       uuid NOT NULL REFERENCES clients(id),
    provider        text NOT NULL,
    credentials_enc text,
    is_active       boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_configs_client_provider_uq ON payment_configs (client_id, provider);

-- ─── Подписчики и подписки ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscribers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tg_user_id   bigint UNIQUE NOT NULL,
    username     text,
    first_name   text,
    language     text,
    is_reachable boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id          uuid NOT NULL REFERENCES clients(id),
    subscriber_id      uuid NOT NULL REFERENCES subscribers(id),
    plan_id            uuid NOT NULL REFERENCES plans(id),
    status             text NOT NULL,
    paid_until         timestamptz,
    grace_until        timestamptz,
    autorenew          boolean NOT NULL DEFAULT true,
    provider           text,
    provider_method_id text,
    source             text,
    is_gift            boolean NOT NULL DEFAULT false,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_subscriber_plan_uq ON subscriptions (subscriber_id, plan_id);
CREATE INDEX IF NOT EXISTS subscriptions_client_status_idx ON subscriptions (client_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_status_paid_idx ON subscriptions (status, paid_until);

CREATE TABLE IF NOT EXISTS payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES clients(id),
    subscription_id     uuid REFERENCES subscriptions(id),
    provider            text NOT NULL,
    provider_payment_id text NOT NULL,
    amount              numeric(12,2) NOT NULL,
    currency            text NOT NULL,
    status              text NOT NULL,
    kind                text NOT NULL DEFAULT 'purchase',
    raw                 jsonb,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_uq ON payments (provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS payments_client_created_idx ON payments (client_id, created_at);

CREATE TABLE IF NOT EXISTS subscription_events (
    id              bigserial PRIMARY KEY,
    subscription_id uuid NOT NULL REFERENCES subscriptions(id),
    event           text NOT NULL,
    actor           text NOT NULL DEFAULT 'system',
    payload         jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Доступ в каналы ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invite_links (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES channels(id),
    plan_id    uuid REFERENCES plans(id),
    url        text NOT NULL,
    kind       text NOT NULL DEFAULT 'join_request',
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_members (
    channel_id    uuid NOT NULL REFERENCES channels(id),
    subscriber_id uuid NOT NULL REFERENCES subscribers(id),
    status        text NOT NULL,
    joined_at     timestamptz,
    left_at       timestamptz,
    PRIMARY KEY (channel_id, subscriber_id)
);

-- ─── События / интеграции ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outbox_events (
    id         bigserial PRIMARY KEY,
    client_id  uuid,
    topic      text NOT NULL,
    payload    jsonb NOT NULL,
    status     text NOT NULL DEFAULT 'new',
    attempts   integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_status_id_idx ON outbox_events (status, id);

CREATE TABLE IF NOT EXISTS audit_log (
    id            bigserial PRIMARY KEY,
    client_id     uuid,
    actor_user_id uuid,
    action        text NOT NULL,
    entity        text,
    entity_id     text,
    payload       jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Seed платформенных тарифов (управляются владельцем платформы) ────────────

INSERT INTO platform_plans (code, name, price_month, commission_pct, limits, features, sort_order)
VALUES
  ('free',  'Free',   0,     5,
   '{"bots":1,"channels":1,"subscribers":100,"staff":1}',
   '{"white_label":false,"custom_payments":false,"api":false}', 0),
  ('start', 'Start',  990,   3,
   '{"bots":1,"channels":3,"subscribers":1000,"staff":2}',
   '{"white_label":false,"custom_payments":true,"api":false}', 1),
  ('pro',   'Pro',    2900,  1,
   '{"bots":3,"channels":15,"subscribers":10000,"staff":5}',
   '{"white_label":true,"custom_payments":true,"api":true}', 2)
ON CONFLICT (code) DO NOTHING;
