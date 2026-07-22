# Gatekeeper

Платформа управления закрытыми Telegram-каналами (B2B2C SaaS).
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

Уберите блок `labels`, сеть `edge` и опубликуйте порт: добавьте `ports: ["3000:3000"]` в сервис `api`. Telegram требует HTTPS для webhook — поставьте перед API любой reverse-proxy с TLS (Caddy/nginx) или туннель.

## Локальная разработка

```bash
pnpm install
# поднять только БД и redis из compose:
docker compose up -d postgres redis
export DATABASE_URL=postgres://gatekeeper:gatekeeper@localhost:5432/gatekeeper
pnpm --filter @gatekeeper/api db:migrate
pnpm dev:api
```

## Интеграция с n8n

Ядро постит доменные события из `outbox_events` на `N8N_EVENTS_WEBHOOK_URL`; n8n дёргает REST API ядра сервисным токеном `N8N_SERVICE_TOKEN`. Каталог workflow и анти-паттерны — в [`04-n8n-automation.md`](../docs/telegram-subscription-platform/04-n8n-automation.md). Токены клиентских ботов **не** покидают ядро — n8n шлёт сообщения только через API.

## Безопасность

- Токены ботов и ключи платёжных шлюзов хранятся только зашифрованными (`SecretBox`, AES-256-GCM); ключ — в `SECRET_ENCRYPTION_KEY`, вне БД.
- Webhook каждого бота защищён индивидуальным `secret_token` (заголовок `X-Telegram-Bot-Api-Secret-Token`).
- Идемпотентность платежей — unique `(provider, provider_payment_id)`.
