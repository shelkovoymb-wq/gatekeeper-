-- Owner payment accounts (платежные реквизиты владельца платформы)

CREATE TABLE IF NOT EXISTS owner_payment_accounts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type   text NOT NULL, -- 'bank_account' | 'card' | 'sbp' | 'paypal' | 'crypto'
    provider       text, -- 'yookassa' | 'prodamus' | 'manual' | 'cryptobot'

    -- Банковские реквизиты
    bank_name      text,
    account_number text,
    bic            text,
    inn            text,

    -- СБП (System for Instant Payments)
    phone_sbp      text,

    -- PayPal
    paypal_email   text,

    -- Криптовалюта
    crypto_address text,
    crypto_type    text, -- 'btc' | 'eth' | 'usdt'

    -- Карта (only last 4 digits stored for PCI compliance)
    card_last4     text,
    card_holder    text,

    -- Статусы и флаги
    is_active      boolean NOT NULL DEFAULT true,
    verification_status text NOT NULL DEFAULT 'pending', -- pending|verified|rejected
    verified_at    timestamptz,

    -- Шифрованные реквизиты (для card_number, account_number etc)
    credentials_enc text,

    -- Документация
    bank_code      text, -- МСП код банка
    sort_code      text, -- UK sort code
    swift_code     text, -- SWIFT код

    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_payment_accounts_active_idx
    ON owner_payment_accounts (is_active, verification_status);
CREATE INDEX IF NOT EXISTS owner_payment_accounts_type_idx
    ON owner_payment_accounts (account_type);

-- Выплаты владельцу (транзакции денег)
CREATE TABLE IF NOT EXISTS owner_payouts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      uuid NOT NULL REFERENCES owner_payment_accounts(id),
    invoice_ids     text[] NOT NULL, -- JSON массив ID счетов, которые покрывает эта выплата
    amount          numeric(12,2) NOT NULL,
    currency        text NOT NULL DEFAULT 'RUB',
    status          text NOT NULL DEFAULT 'pending', -- pending|processing|completed|failed|cancelled

    -- Информация о платеже
    provider_payout_id text, -- ID выплаты у провайдера (для tracking)
    error_message   text, -- Если failed

    created_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_payouts_status_idx ON owner_payouts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS owner_payouts_account_idx ON owner_payouts (account_id);

-- История выплат (audit log)
CREATE TABLE IF NOT EXISTS owner_payout_events (
    id          bigserial PRIMARY KEY,
    payout_id   uuid NOT NULL REFERENCES owner_payouts(id),
    event       text NOT NULL, -- initiated|processing|completed|failed|cancelled
    details     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_payout_events_payout_idx ON owner_payout_events (payout_id);
