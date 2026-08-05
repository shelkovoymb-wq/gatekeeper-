# Gatekeeper

Платформа управления закрытыми Telegram-каналами (B2B2C SaaS).

> **Обновление доставки апдейтов**: `/tg/webhook/:botId` ниже описывает
> изначальный webhook-дизайн; в проде боты сейчас работают через
> **long polling** (`apps/api/src/telegram/bot-poller.ts`) — входящие
> webhook-соединения от Telegram блокируются на уровне сети, а long
> polling требует только исходящих. `BotsService.register` больше не
> вызывает `setWebhook`. Подробности и дата — в `PROGRESS.md` (Session 4).
Хост платформы — **gatekeeper.skud24.ru** (A → 109.235.217.39). На нём Core API; кабинет (Next.js) в Фазе 1 получит отдельный поддомен (напр. `app.gatekeeper.skud24.ru`).

> Архитектура и обоснование решений — в [`../docs/telegram-subscription-platform/`](../docs/telegram-subscription-platform/).
> Этот каталог — реализация (Фаза 0: фундамент).

## Что уже есть (Фаза 0)

- Монорепо на pnpm: `apps/api` (NestJS, ESM), `packages/shared` (общие типы/контракты).
- **Полная схема БД** (`apps/api/src/db/schema.ts`) + идемпотентная init-миграция с сидом платформенных тарифов (`free`/`start`/`pro`).
- Ядро API: валидация env (zod), пул PostgreSQL (drizzle), `/healthz`, AES-256-GCM конверт для секретов, мульти-бот webhook `POST /tg/webhook/:botId` с проверкой секрет-токена.
- Docker-compose под домашнюю лабу: `api` + `postgres:16` + `redis:7`, интеграция с существующим Traefik (`edge` сеть, резолвер `le`).

Следующее — Фаза 1 (MVP), см. [roadmap](../docs/telegram-subscription-platform/05-roadmap.md).

## Структура

```
gatekeeper/
├── apps/
│   └── api/                 # Core API (NestJS, модульный монолит)
│       ├── src/
│       │   ├── config/      # валидация окружения (zod)
│       │   ├── db/          # drizzle schema, миграции, раннер
│       │   ├── common/      # crypto (SecretBox)
│       │   ├── health/      # /healthz
│       │   └── telegram/    # мульти-бот webhook + роутер апдейтов
│       └── Dockerfile
├── packages/
│   └── shared/              # статусы, события, лимиты — общие типы
├── docker-compose.yml
└── .env.example
```

## Запуск в домашней лабе

Деплой-хост — **traefik-ha (192.168.1.44)**, там же общий Traefik стека skud24
(`/opt/skud24-traefik`, сеть `skud24-traefik_traefik-net`, resolver `le`).
`docker-compose.yml` уже настроен под эти реквизиты.

1. Подготовьте окружение:
   ```bash
   cd gatekeeper
   cp .env.example .env
   # заполните секреты:
   openssl rand -base64 32   # → SECRET_ENCRYPTION_KEY
   openssl rand -hex 32      # → JWT_SECRET, N8N_SERVICE_TOKEN
   #   POSTGRES_PASSWORD, PUBLIC_API_URL=https://gatekeeper.skud24.ru и т.д.
   ```
2. DNS: `gatekeeper.skud24.ru` → 109.235.217.39 (ingress-хост с Traefik) — уже создана.
3. Поднимите стек:
   ```bash
   docker compose up -d --build
   docker compose logs -f api
   ```
   На старте контейнер применит миграции и поднимет API. Проверка:
   ```bash
   curl https://gatekeeper.skud24.ru/healthz
   # {"status":"ok","service":"gatekeeper-api","db":true,...}
   ```

### Без Traefik

Уберите блок `labels`, внешнюю сеть `traefik` и опубликуйте порт: добавьте `ports: ["3000:3000"]` в сервис `api`. Telegram требует HTTPS для webhook — поставьте перед API любой reverse-proxy с TLS (Caddy/nginx) или туннель.

## Локальная разработка

```bash
pnpm install
# поднять только БД и redis из compose:
docker compose up -d postgres redis
export DATABASE_URL=postgres://gatekeeper:gatekeeper@localhost:5432/gatekeeper
pnpm --filter @gatekeeper/api db:migrate
pnpm dev:api
```

## Фаза 1 — join-request flow (реализовано)

Первый вертикальный срез: подключение бота → канал → выдача/отзыв доступа по подписке.
Управляющие эндпоинты защищены `Authorization: Bearer $N8N_SERVICE_TOKEN`.

| Метод | Эндпоинт | Назначение |
|---|---|---|
| `POST` | `/v1/bots` | Подключить бота по токену (getMe, шифрование, setWebhook) |
| `GET` | `/v1/channels?botId=` | Каналы бота |
| `POST` | `/v1/channels/:id/invite-link` | Создать join-request invite-ссылку |
| `POST` | `/v1/plans` | Создать тариф (+ привязать каналы) |
| `POST` | `/v1/plans/:id/channels` | Привязать каналы к тарифу |
| `POST` | `/v1/subscriptions/grant` | Ручная выдача/продление подписки |
| `POST` | `/tg/webhook/:botId` | Webhook Telegram (secret-token) |

Обрабатываемые апдейты: `my_chat_member` (бота сделали админом → канал регистрируется),
`chat_join_request` (approve при активной подписке, иначе decline + ЛС),
`chat_member` (учёт входов/выходов, детект «зайцев»).

### Проверочный сценарий

```bash
API=https://gatekeeper.skud24.ru
TOKEN=$N8N_SERVICE_TOKEN   # из .env

# 1. Подключить бота платформы
curl -sX POST $API/v1/bots -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"token":"<BOTFATHER_TOKEN>","isPlatformBot":true}'
#  → {botId, tgBotId, username, webhookUrl}

# 2. В Telegram: создать приватный канал, добавить бота АДМИНОМ
#    (права «Пригласительные ссылки» + «Блокировать пользователей»).
#    Бэкенд поймает my_chat_member и создаст channel (bot_status=ok).
curl -s "$API/v1/channels?botId=<botId>" -H "Authorization: Bearer $TOKEN"
#  → [{ id: <channelId>, title, bot_status: "ok", ... }]

# 3. Создать тариф на 30 дней, привязать канал
curl -sX POST $API/v1/plans -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Клуб 30 дней","price":990,"periodDays":30,"channelIds":["<channelId>"]}'
#  → { id: <planId>, ... }

# 4. Выдать подписку тестовому пользователю (по его Telegram user_id)
curl -sX POST $API/v1/subscriptions/grant -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tgUserId":<USER_ID>,"planId":"<planId>"}'

# 5. Получить join-request ссылку и отдать пользователю
curl -sX POST $API/v1/channels/<channelId>/invite-link -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"planId":"<planId>"}'
#  → { url }

# 6. Пользователь жмёт ссылку → бот АППРУВИТ вход (есть активная подписка).
#    Пользователь без подписки → decline + сообщение с призывом оформить /start.
```

### Автоматика жизненного цикла (реализовано)

- **Reaper** (`@Cron */5 мин`): `active` (истёк `paid_until`, `grace_days>0`) → `grace`;
  `grace` (истёк `grace_until`) или `active` без grace → `expired` + постановка kick.
  Все переходы идемпотентны (bulk `UPDATE ... RETURNING`).
- **Очередь доступа** (BullMQ, Redis): `AccessWorker` выполняет «мягкий kick» (ban+unban)
  с retry/exponential backoff; kick пропускается, если у подписчика есть другая
  активная подписка на канал.
- **Outbox → n8n**: изменения статуса пишутся в `outbox_events`; `OutboxDispatcher`
  (`@Cron 30с`) POST'ит их на `N8N_EVENTS_WEBHOOK_URL` (`subscription.grace`,
  `subscription.expired`, …) для dunning/welcome/алертов. При недоступности n8n —
  ретраи до 5 попыток, затем `failed` (не теряются).

Полный цикл: `оплатил → впустили → истёк → grace → kick → оплатил → вернули`.
Платёжная часть (ЮKassa + Stars, авто-charge при продлении) — следующий шаг.

## Интеграция с n8n

Ядро постит доменные события из `outbox_events` на `N8N_EVENTS_WEBHOOK_URL`; n8n дёргает REST API ядра сервисным токеном `N8N_SERVICE_TOKEN`. Каталог workflow и анти-паттерны — в [`04-n8n-automation.md`](../docs/telegram-subscription-platform/04-n8n-automation.md). Токены клиентских ботов **не** покидают ядро — n8n шлёт сообщения только через API.

## Безопасность

- Токены ботов и ключи платёжных шлюзов хранятся только зашифрованными (`SecretBox`, AES-256-GCM); ключ — в `SECRET_ENCRYPTION_KEY`, вне БД.
- Webhook каждого бота защищён индивидуальным `secret_token` (заголовок `X-Telegram-Bot-Api-Secret-Token`).
- Идемпотентность платежей — unique `(provider, provider_payment_id)`.
