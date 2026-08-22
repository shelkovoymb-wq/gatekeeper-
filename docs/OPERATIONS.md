# Gatekeeper — эксплуатация продакшена

Этот документ описывает **фактически развёрнутую** топологию Gatekeeper в домашней
лаборатории (skud24.ru), как всё связано и как переразвернуть/диагностировать.

---

## 1. Топология

```
                    Internet
                       │  https://gatekeeper.skud24.ru
                       ▼
        ┌─────────────────────────────────┐
        │  traefik-ha (192.168.1.44)       │
        │  ── Traefik (TLS, certresolver le)│
        │  ── nginx «gatekeeper-proxy»      │  ← path-split роутинг
        └───────────────┬─────────────────┘
                        │  (внутр. сеть 192.168.1.0/24)
             ┌──────────┴───────────┐
             ▼                      ▼
     192.168.1.25:3000       192.168.1.25:3001
        (API, NestJS)         (Web, Next.js)
             └──────────┬───────────┘
                        ▼
        ┌─────────────────────────────────┐
        │  LXC 150 на pve3 (192.168.1.25)  │
        │  docker compose:                 │
        │    api  (NestJS)   :3000         │
        │    web  (Next.js)  :3001→3000    │
        │    postgres (16)                 │
        │    redis (7)                     │
        └─────────────────────────────────┘
```

- **DNS**: `gatekeeper.skud24.ru` A → 109.235.217.39 (внешний IP лаборатории).
- **TLS**: Traefik на .44, certresolver `le`, сеть `skud24-traefik_traefik-net`.
- **gatekeeper-proxy**: nginx-контейнер на .44, делает разбор путей и проксирует
  на LXC 150 (см. `deploy/pve3/gatekeeper-proxy/nginx.conf`).

### Разбор путей (nginx на .44)

| Путь                         | Назначение     | Апстрим              |
|------------------------------|----------------|----------------------|
| `/healthz`, `/v1/`, `/tg/`, `/payments` | Backend API | `192.168.1.25:3000` |
| `/` (всё остальное)          | Next.js админка| `192.168.1.25:3001` |

Админка Next.js обслуживает и свои BFF-роуты (`/api/*`) — они тоже уходят на web
и уже сервер-сайд ходят в API по внутренней сети.

---

## 2. Компоненты

### API (`apps/api`, NestJS, порт 3000)
- Telegram join-request контроль доступа, reaper (trial→active→grace→expired→kick),
  платежи (YooKassa/CloudPayments/Robokassa/Telegram Stars), outbox → n8n.
- Read-only админ-агрегаты: `GET /v1/admin/{stats,channels,subscribers,payments}`
  (защищены `ServiceTokenGuard`, токен = `N8N_SERVICE_TOKEN`).

### Web (`apps/web`, Next.js 15 + React 19, порт 3001→3000)
- Админ-панель на `/admin/{stats,channels,users,payments}`, тёмная тема.
- **BFF-паттерн**: route handlers `apps/web/src/app/api/*` на сервере ходят в API
  (`BACKEND_URL=http://api:3000`) с **JWT пользователя** из httpOnly-куки
  `gk_session` (`apps/web/src/lib/cabinet.ts`). Токен из браузера не виден —
  только сервер-сайд. Сервис-токена платформы в web-контейнере нет: BFF не
  должен уметь больше, чем залогиненный пользователь, иначе любой роут,
  забывший проверить сессию, становится путём к чужим данным.
- Никаких моков: все данные из реальной БД через API.

### Данные
- **PostgreSQL 16** — основное хранилище (Drizzle ORM, миграции в
  `apps/api/src/db/migrations`).
- **Redis 7** — очереди BullMQ (reaper, outbox-диспетчер).

---

## 3. Переменные окружения (`gatekeeper/.env` на LXC 150)

Ключевые (полный список — `.env.example`):

| Переменная            | Назначение                                  |
|-----------------------|---------------------------------------------|
| `POSTGRES_PASSWORD`   | Пароль БД                                   |
| `N8N_SERVICE_TOKEN`   | Сервис-токен `ServiceTokenGuard` (вызовы из n8n) |
| `TELEGRAM_*`          | Токены/секреты ботов                        |
| `YOOKASSA_*`, `CLOUDPAYMENTS_*`, `ROBOKASSA_*` | Ключи провайдеров          |
| `DIRECT_WEBHOOK_SECRET` | Секрет подписи подтверждений прямых переводов |
| `N8N_WEBHOOK_URL`     | Куда API шлёт события outbox                 |

> web-сервису сервис-токен не нужен и не передаётся. Если в `.env` на проде
> остался `GATEKEEPER_API_TOKEN` — он больше ни на что не влияет.

---

## 4. Развёртывание / передеплой

Всё делается на LXC 150 (`pct exec 150` с pve3, либо `ssh` внутрь).

Каталог `/opt/gatekeeper-src/gatekeeper` — это git-checkout (до 16.08.2026 код
заливали тарболлами `gk-src*.tgz`, `.git` там не было). `.env` и
`deploy/pve3/.env` не в индексе, поэтому `reset --hard` их не трогает.

```bash
cd /opt/gatekeeper-src/gatekeeper
C="docker compose --env-file .env -f deploy/pve3/docker-compose.yml"

# Обновление кода
git fetch --depth 1 origin main
git reset --hard FETCH_HEAD
git log --oneline -1

# Сборка (BuildKit выключен — в лабе TLS-инспекция ломает часть загрузок)
export DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0
# web пересобирать обязательно вместе с api, если менялись страницы кабинета
# или BFF-роуты /api/* — они живут в web, и без его пересборки новые экраны
# в проде не появятся.
$C build api web

# Запуск
$C up -d

# Статус / логи
$C ps
$C logs -f web
$C logs -f api
```

### Проверка после деплоя

```bash
# API
curl -s localhost:3000/healthz

# Web (Next.js)
curl -s -o /dev/null -w "%{http_code}\n" localhost:3001/            # 200/307
curl -s localhost:3001/api/stats | head -c 300                      # BFF → реальные данные

# Снаружи
curl -s https://gatekeeper.skud24.ru/healthz
curl -s -o /dev/null -w "%{http_code}\n" https://gatekeeper.skud24.ru/admin/stats
```

---

## 5. Типовые проблемы (лабораторные грабли)

| Симптом | Причина | Решение |
|---------|---------|---------|
| `next build` виснет в `pnpm install` на несколько минут | Playwright (devDep) тянет браузеры через TLS-инспекцию | В Dockerfile web стоит `ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` |
| `COPY /app/apps/web/public: file does not exist` | нет каталога `public` | В builder-стадии `RUN mkdir -p public && pnpm build`; в репо есть `public/.gitkeep` |
| `502 Bad Gateway` снаружи | web/api контейнер не поднят или упал | `$C ps`, `$C logs web`; проверить `.env` и апстримы в nginx на .44 |
| BFF `/api/*` отдаёт 401 | нет или протухла сессионная кука `gk_session` (JWT живёт 7 дней) | Перелогиниться. 401 здесь — штатный ответ, а не поломка конфигурации: BFF пробрасывает JWT пользователя, своего токена у него нет |
| apt/сборка виснут на IPv6 | нет IPv6-маршрута в лабе | `Acquire::ForceIPv4=true`, `precedence ::ffff:0:0/96 100` в gai.conf |
| Сборка встала намертво: лог не растёт, CPU простаивает, образ не тегается | Зависла работа dockerd с образами. Признак: `docker system df` не отвечает по таймауту, процессы compose висят в `futex_do_wait` (`ps -o wchan`), при этом `docker run` на готовом образе ещё работает | `systemctl restart docker` — контейнеры вернутся сами (`restart: unless-stopped`), но сайт на минуту-две уйдёт в 502. Перед этим снять зависшие процессы сборки **по PID** (`pkill -f 'docker compose'` совпадёт с собственной командной строкой SSH и убьёт сессию). Осиротевший build-контейнер в статусе `Created` — `docker rm -f <id>` |
| `api` в рестарт-лупе после деплоя, в логе PostgresError | Раннер (`dist/db/migrate.js`) применяет миграции по порядку и **останавливается на первой упавшей** — все последующие не применяются, приложение не стартует | `docker logs pve3-api-1` → найти файл. Починить SQL в репозитории; на проде применить исправленный DDL вручную и дописать имя файла в `_migrations`, иначе образ с прежней копией миграций упадёт снова (миграции копируются внутрь образа при сборке) |
| Сборка падает на `COPY --from=builder`: `write …: no space left on device` | Диск LXC 150 — 20 ГБ, и каждая пересборка оставляет слой-сироту и кэш сборки. Пары пересборок хватает, чтобы забить его под 95% | `docker image prune -f` + `docker builder prune -f` (в августе 2026 освободили 13.4 ГБ: 95% → 19%). Тегированные образы работающих контейнеров это не трогает, простоя нет. `docker system df` и `du` по `/var/lib/docker` на забитом диске отвечают минутами — не считать их зависшими, просто ждать. Чистить стоит **до** сборки, а не после падения |
| Эндпоинт есть в коде, но снаружи 404 | Наружу через nginx проброшены только `/healthz`, `/tg/`, `/payments/webhook/` — остальное уходит в Next.js. Это защита, а не баг | Владельческие и клиентские ручки вызываются из браузера через BFF `/api/*`, который ходит в API по внутренней сети. Новый эндпоинт для кабинета → префикс `v1/...` + BFF-роут в `apps/web/src/app/api/` |

---

## 6. Мониторинг

- **Health Watchdog** (n8n `EZWd6GmEvfGQWFbc`) периодически дёргает
  `https://gatekeeper.skud24.ru/healthz` и алертит при падении. На время
  передеплоя его можно ставить на паузу, после — снова включать.
- Логи контейнеров — `docker compose ... logs`.
- БД — `docker compose ... exec postgres psql -U gatekeeper`.

---

## 7. Резервное копирование

```bash
# Дамп БД
docker compose --env-file .env -f deploy/pve3/docker-compose.yml \
  exec -T postgres pg_dump -U gatekeeper gatekeeper > db_$(date +%F).sql
# Redis — AOF в volume redisdata (appendonly yes)
```
