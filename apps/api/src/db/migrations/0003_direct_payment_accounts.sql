-- Таблица для хранения банковских реквизитов владельцов для прямых платежей
CREATE TABLE IF NOT EXISTS direct_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  account_type text NOT NULL, -- card | bank_account | sbp | paypal
  -- Для карт
  card_number_masked text, -- последние 4 цифры: **** **** **** 1234
  card_holder text,
  -- Для банковских счётов
  bank_name text,
  account_number text,
  bic text,
  inn text,
  -- Универсальные поля
  phone_number text,
  email text,
  -- СБП / P2P
  phone_for_sbp text,
  -- Статус
  is_active boolean NOT NULL DEFAULT true,
  verification_status text NOT NULL DEFAULT 'unverified', -- unverified | pending | verified | rejected
  verified_at timestamptz,
  -- Аудит
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_active_account_per_client UNIQUE (client_id, account_type) WHERE is_active = true
);

CREATE INDEX IF NOT EXISTS direct_payment_accounts_client_idx ON direct_payment_accounts(client_id);
CREATE INDEX IF NOT EXISTS direct_payment_accounts_status_idx ON direct_payment_accounts(verification_status);
