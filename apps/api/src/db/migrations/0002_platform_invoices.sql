-- Платформенный биллинг поверх существующей platform_invoices (0000_init):
-- один счёт на клиента за период (идемпотентная генерация) + индексы.
CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_client_period_uq
  ON platform_invoices (client_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS platform_invoices_status_idx
  ON platform_invoices (status);

CREATE INDEX IF NOT EXISTS platform_invoices_client_idx
  ON platform_invoices (client_id);
