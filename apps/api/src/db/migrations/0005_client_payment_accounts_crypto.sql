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

-- Индекса под поиск реквизитов получателя здесь нет намеренно: партиальный
-- уникальный direct_payment_accounts_active_uniq (client_id, account_type)
-- WHERE is_active из миграции 0003 уже покрывает этот запрос — он ведёт по
-- client_id внутри только активных строк, а их у клиента единицы. Добавленный
-- сверх него индекс из первой версии этой миграции снимается в 0006.
