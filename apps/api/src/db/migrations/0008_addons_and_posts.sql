-- Платные опции поверх тарифа платформы + отложенные посты в каналы.
--
-- Модель подписки на опцию взята из скилла prodamus-subscription
-- (.claude/skills/prodamus-subscription): статусы, журнал событий с замком
-- идемпотентности, правило «оплаченный вперёд период не отбирают».

-- ─── Каталог платных опций ───────────────────────────────────────────────────
-- Цена и период лежат в данных, а не в коде: следующая опция добавляется
-- строкой, без правки сервисов.
CREATE TABLE IF NOT EXISTS addons (
  code         text PRIMARY KEY,                       -- posting
  name         text NOT NULL,
  description  text,
  price_month  numeric(12,2) NOT NULL DEFAULT '0',
  currency     text NOT NULL DEFAULT 'RUB',
  period_days  integer NOT NULL DEFAULT 31,
  payment_url  text,                                   -- форма оплаты шлюза
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO addons (code, name, description, price_month, period_days)
VALUES (
  'posting',
  'Посты в каналы',
  'Публикация постов в закрытые каналы: сразу или по расписанию, с фото, видео и документами.',
  490,
  31
)
ON CONFLICT (code) DO NOTHING;

-- ─── Подписка клиента на опцию ───────────────────────────────────────────────
-- Статусы ровно из скилла, новых не выдумываем:
--   free     — выдан вручную (подарок, свои), дата не проверяется
--   trial    — пробный период, по дате
--   active   — оплачен, по дате
--   past_due — списание не прошло, шлюз повторяет. Отсрочки НЕТ: доступ ровно
--              до expires_at, иначе клиент зависает в past_due навсегда и
--              работает бесплатно месяцами
--   expired  — доступа нет
CREATE TABLE IF NOT EXISTS client_addons (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL REFERENCES clients(id),
  addon_code              text NOT NULL REFERENCES addons(code),
  status                  text NOT NULL DEFAULT 'expired',
  expires_at              timestamptz,
  gateway_subscription_id text,
  billing_email           text,
  billing_phone           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_addons_uniq UNIQUE (client_id, addon_code)
);

CREATE INDEX IF NOT EXISTS client_addons_lookup_idx
  ON client_addons (client_id, addon_code, status);

-- ─── Журнал событий шлюза ────────────────────────────────────────────────────
-- Пишется ВСЕГДА: и при неверной подписи, и когда клиент не найден. Иначе
-- разбирать жалобу «я оплатил, доступа нет» будет нечем.
--
-- UNIQUE на event_key — это и есть замок идемпотентности. Шлюзы повторяют
-- доставку часами; без него подписка продлевалась бы кратно числу ретраев.
CREATE TABLE IF NOT EXISTS payment_events (
  id          bigserial PRIMARY KEY,
  event_key   text NOT NULL UNIQUE,
  client_id   uuid REFERENCES clients(id),             -- null: клиента не нашли
  addon_code  text,
  event_type  text NOT NULL,
  amount      numeric(12,2),
  currency    text,
  signature   text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_events_client_idx ON payment_events (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_type_idx   ON payment_events (event_type, created_at DESC);

-- ─── Часовой пояс клиента ────────────────────────────────────────────────────
-- Отложенная публикация назначается в его времени, а хранится в UTC. Пояс
-- берём из браузера (Intl.DateTimeFormat) при первом входе в раздел постов.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS timezone text;

-- ─── Посты ───────────────────────────────────────────────────────────────────
-- body_html — уже в разметке Telegram: sendMessage шлётся с parse_mode=HTML,
-- поэтому редактор отдаёт ровно то, что уйдёт в канал.
CREATE TABLE IF NOT EXISTS posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id),
  body_html      text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'draft',        -- draft|scheduled|publishing|published|failed
  publish_at     timestamptz,                          -- null у черновика
  published_at   timestamptz,
  error          text,
  disable_preview boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_client_idx   ON posts (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_schedule_idx ON posts (status, publish_at);

-- Куда публикуем. message_id хранится с первого дня: без него нельзя ни
-- отредактировать, ни удалить уже опубликованное.
CREATE TABLE IF NOT EXISTS post_targets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id),
  message_id bigint,
  error      text,
  sent_at    timestamptz,
  CONSTRAINT post_targets_uniq UNIQUE (post_id, channel_id)
);

CREATE INDEX IF NOT EXISTS post_targets_post_idx ON post_targets (post_id);

-- Вложения.
--
-- Файл живёт у нас ровно до первой отправки: залить его в Telegram заранее
-- нельзя — file_id появляется только после отправки в конкретный чат, а
-- «отправить и удалить» означало бы мигание поста у подписчиков.
-- Поэтому storage_path — временное хранилище, а file_id заполняется после
-- первой успешной публикации и дальше используется для остальных каналов и
-- для повторов задачи (файл при этом с диска удаляется).
CREATE TABLE IF NOT EXISTS post_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type   text NOT NULL,                          -- photo|video|document
  file_id      text,                                   -- есть после первой отправки
  storage_path text,                                   -- есть до первой отправки
  file_name    text,
  file_size    bigint,
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_media_source_chk CHECK (file_id IS NOT NULL OR storage_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS post_media_post_idx ON post_media (post_id, position);
