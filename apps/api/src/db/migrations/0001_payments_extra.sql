-- Расширение payments под payments-модуль: подписчик, метаданные, updated_at.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS subscriber_id uuid REFERENCES subscribers(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
