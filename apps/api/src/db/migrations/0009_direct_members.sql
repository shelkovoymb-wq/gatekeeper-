-- Участники, которых клиент добавил в канал сам, минуя платформу.
--
-- Зачем: клиент вправе получать деньги напрямую — наличными, переводом, как
-- угодно — и заводить оплатившего в канал руками. Платформа на такие входы
-- уже смотрит (chat_member → статус unauthorized в channel_members), но до сих
-- пор ничего с ними не делала. Теперь каждый такой вход попадает сюда и
-- участвует в месячном счёте наравне с обычной выручкой.
--
-- Ключевое правило: строка заводится на МЕСЯЦ. Один и тот же человек,
-- добавленный повторно в следующем месяце, — это вторая продажа, и счёт за неё
-- выставляется снова. Повторное добавление внутри одного месяца счёт не
-- задваивает (UNIQUE ниже).
CREATE TABLE IF NOT EXISTS direct_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id),
  channel_id      uuid NOT NULL REFERENCES channels(id),
  subscriber_id   uuid NOT NULL REFERENCES subscribers(id),
  -- Первое число месяца, в котором участника заметили. По нему счёт и считается.
  period_month    date NOT NULL,
  -- pending   — замечен, клиент ещё не оформил
  -- declared  — клиент указал тариф и сумму, которую получил
  -- dismissed — не продажа (свой сотрудник, админ, гость): в счёт не идёт
  status          text NOT NULL DEFAULT 'pending',
  plan_id         uuid REFERENCES plans(id),
  declared_amount numeric(12,2),
  currency        text NOT NULL DEFAULT 'RUB',
  note            text,
  dismiss_reason  text,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  left_at         timestamptz,
  -- Куда попала строка при выставлении счёта — чтобы спор разбирался по фактам.
  billed_invoice_id uuid REFERENCES platform_invoices(id),
  billed_base     numeric(12,2),
  billed_at       timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_members_period_uq UNIQUE (channel_id, subscriber_id, period_month)
);

CREATE INDEX IF NOT EXISTS direct_members_client_idx ON direct_members (client_id, period_month);
CREATE INDEX IF NOT EXISTS direct_members_status_idx ON direct_members (client_id, status);
