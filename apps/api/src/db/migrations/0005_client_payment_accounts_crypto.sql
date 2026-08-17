-- Реквизиты клиентов: докидываем криптовалюту, чтобы набор типов совпал с
-- владельческим (bank_account | card | sbp | paypal | crypto).
--
-- Остальные типы уже лежат в этой таблице, просто под своими именами колонок:
-- PayPal — email, СБП — phone_for_sbp, карта — card_number_masked. Наружу
-- кабинет отдаёт их под теми же именами, что и владельческая ручка
-- (paypalEmail / phoneSbp / cardLast4) — маппинг делает CabinetService.

ALTER TABLE direct_payment_accounts
  ADD COLUMN IF NOT EXISTS crypto_address text,
  ADD COLUMN IF NOT EXISTS crypto_type text;

-- Прямой перевод ищет реквизиты получателя по (client_id, is_active,
-- verification_status) — без индекса это seq scan на каждом платеже.
CREATE INDEX IF NOT EXISTS direct_payment_accounts_active_idx
  ON direct_payment_accounts (client_id, is_active, verification_status);
