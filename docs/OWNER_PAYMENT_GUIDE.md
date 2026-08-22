# Реквизиты владельца и выплаты

Куда платформа перечисляет заработанное и как это учитывается.

## Что это

Владелец платформы получает доход из двух источников:

1. **Абонентская плата** — месячный платёж клиента за тариф
2. **Комиссия с оборота** — процент от платежей подписчиков

Счета клиентам генерируются отдельно (см. `docs/PAYMENTS_GUIDE.md`). Этот модуль
отвечает за вторую половину: **на какие реквизиты владельца уходят деньги** и
**какие выплаты уже прошли**.

## Где смотреть в интерфейсе

Кабинет владельца → **«Реквизиты и выплаты»** (`/owner/payouts`).

На странице: плитки статистики, форма добавления реквизитов, список реквизитов
с кнопками «Подтвердить»/«Отключить» и история выплат.

## Как устроен доступ

Это важно понимать, прежде чем дёргать эндпоинты curl-ом.

```
браузер ──► Next.js /api/platform/*  (BFF, тот же домен)
                    │  внутренняя docker-сеть, JWT из httpOnly-куки
                    ▼
            NestJS /v1/platform/*     (наружу НЕ проброшен)
```

nginx на traefik-ha пробрасывает в API **только** `/healthz`, `/tg/` и
`/payments/webhook/` — всё остальное уходит в Next.js
(см. `deploy/pve3/gatekeeper-proxy/nginx.conf`). Это сделано намеренно: владельческие
эндпоинты не должны торчать в интернет. Поэтому:

- ❌ `https://gatekeeper.skud24.ru/v1/platform/payment-accounts` — вернёт 404 от Next.js
- ✅ `https://gatekeeper.skud24.ru/api/platform/payment-accounts` — BFF-роут, работает из браузера с сессионной кукой

Контроллер живёт под префиксом `v1/platform` — как `PlatformController`, а не под
собственным `/owner`, который был бы недостижим из браузера.

> **У клиентов платформы теперь то же самое.** Кабинет клиента → «Приём денег»
> (`/admin/payment-methods`) — один экран на платёжные системы и собственные
> реквизиты: для клиента это одно и то же, «куда мне приходят деньги».
> API: `/api/payment-methods` → `/v1/cabinet/payment-methods` (общий список),
> запись реквизитов — `/api/payment-accounts` → `/v1/cabinet/payment-accounts`.
>
> Прямой перевод банк платформе не подтверждает, поэтому клиент отмечает его
> сам на странице «Платежи» кнопкой «Деньги получены»
> (`POST /v1/cabinet/transactions/:id/confirm`). Платёж переходит в `succeeded`
> с `confirmed_by = 'client'`, попадает в оборот и в базу комиссии, а в счёте
> такой оборот показан отдельной строкой `turnoverSelfReported` — владелец
> видит, какая часть посчитана со слов клиента, и может её оспорить.
> Набор типов и имена полей совпадают с владельческими, разница в двух вещах:
> реквизиты клиента лежат в `direct_payment_accounts` (туда же смотрит
> `DirectTransferProvider`, когда формирует инструкцию по оплате), и клиент **не
> может подтвердить себя сам** — `verification_status` ставится в `pending`, а
> `verified` выдаёт платформа через `POST /payment-accounts/:id/verify`
> (`ServiceTokenGuard`). Активный счёт каждого типа — один: новый гасит прежний.

## Типы реквизитов

| Тип | Поля | Что хранится |
|-----|------|--------------|
| `bank_account` | `bankName`, `accountNumber`, `bic`, `inn` | номер отдаётся маскированным |
| `card` | `cardLast4`, `cardHolder` | только последние 4 цифры, полного номера нет |
| `sbp` | `phoneSbp` | телефон |
| `paypal` | `paypalEmail` | email |
| `crypto` | `cryptoAddress`, `cryptoType` (`btc`/`eth`/`usdt`) | адрес кошелька |

Любой другой `accountType` отвергается с 400.

## Состояния

**Реквизиты** (`verification_status`), стартуют с `pending`:

```
pending ──► verified   (можно платить)
   └─────► rejected    (нельзя)
```

Отдельный флаг `is_active`: «Отключить» ставит его в `false` — запись сохраняется
для истории, но выплату на неё создать нельзя.

**Выплаты** (`status`):

```
pending ──► processing ──► completed
   └────────────┴────────► failed
```

`completed_at` проставляется при переходе в `completed` или `failed`. Каждый переход
пишется в `owner_payout_events`.

## API

Пути ниже — как их видит браузер (BFF). Внутренний путь получается заменой
`/api/platform` на `/v1/platform`.

### Реквизиты

```http
GET    /api/platform/payment-accounts        # список
POST   /api/platform/payment-accounts        # добавить
GET    /api/platform/payment-accounts/:id    # один
POST   /api/platform/payment-accounts/:id/verify
DELETE /api/platform/payment-accounts/:id    # отключить (is_active=false)
```

Добавление:

```jsonc
// bank_account
{ "accountType": "bank_account", "bankName": "Сбербанк",
  "accountNumber": "40817810638050123456", "bic": "044525225", "inn": "7707083893" }

// card — полный номер не принимаем
{ "accountType": "card", "cardLast4": "4242", "cardHolder": "Ivan Petrov" }

// sbp
{ "accountType": "sbp", "phoneSbp": "+79991234567" }

// paypal
{ "accountType": "paypal", "paypalEmail": "owner@example.com" }

// crypto
{ "accountType": "crypto", "cryptoAddress": "bc1q…", "cryptoType": "btc" }
```

Ответ (обёрнут BFF в `{ success, data }`):

```json
{
  "id": "0f8a…",
  "accountType": "bank_account",
  "bankName": "Сбербанк",
  "accountNumber": "****3456",
  "bic": "044525225",
  "isActive": true,
  "verificationStatus": "pending",
  "verifiedAt": null,
  "createdAt": "2026-08-13T15:00:00.000Z"
}
```

`accountNumber` всегда маскирован до последних 4 цифр, `credentialsEnc` наружу не
уходит вообще.

### Выплаты

```http
GET  /api/platform/payouts               # список, ?status= для фильтра
GET  /api/platform/payouts/:id           # одна
POST /api/platform/payouts               # создать
GET  /api/platform/payouts-stats         # сводка
```

Создание:

```json
{ "accountId": "0f8a…", "invoiceIds": ["inv_1", "inv_2"], "amount": 145000 }
```

Требования: счёт существует, `is_active = true` и `verification_status = 'verified'`.
Иначе 404 или 400.

Сводка:

```json
{ "pending": 2, "processing": 1, "completed": 45, "failed": 2, "totalAmount": 6750000 }
```

## Схема БД

Миграция `0004_owner_payment_accounts.sql`, три таблицы:

**`owner_payment_accounts`** — реквизиты. Индексы по `(is_active, verification_status)`
и `(account_type)`.

**`owner_payouts`** — выплаты. `account_id` → FK на реквизиты.

> `invoice_ids` имеет тип **`text`**, а не `text[]`: сервис кладёт туда
> `JSON.stringify(ids)` и читает `JSON.parse`, согласовано со схемой drizzle
> (`text('invoice_ids')`). С `text[]` Postgres отверг бы JSON-строку в рантайме —
> на юнит-тестах это закреплено отдельной проверкой.

**`owner_payout_events`** — журнал переходов: `initiated`, `processing`, `completed`,
`failed`, `cancelled` + `details jsonb`.

## Безопасность

- Полные номера карт не хранятся — только последние 4 цифры
- `accountNumber` маскируется на выходе из сервиса, не в UI
- `credentialsEnc` вырезается из любого ответа
- Доступ только при `role = 'owner'` **и** пустом `clientId`: owner-токен,
  выданный в контексте клиента, к кассе платформы не пускают
- Эндпоинты не проброшены наружу через nginx — только через BFF с сессионной кукой
- Каждая выплата оставляет audit trail в `owner_payout_events`

## Тесты

```bash
pnpm test                        # весь монорепозиторий
pnpm --filter @gatekeeper/api test
```

Юнит-тесты гоняются на **vitest** без Postgres: drizzle подменяется дублем
`apps/api/src/owner/fake-db.ts`, который записывает, что именно сервис собирался
положить в базу.

Покрыто: валидация типа реквизитов, маскирование, отказ в выплате на
неверифицированный/неактивный счёт, сериализация `invoiceIds` в JSON-строку,
проставление `completed_at` только на финальных статусах, приведение bigint-счётчиков
Postgres к числам, и полная матрица доступа (владелец / админ клиента /
owner-токен с `clientId`) по всем девяти эндпоинтам.

## Деплой

Порядок и грабли этого хоста — в `docs/OPERATIONS.md`, раздел «Развёртывание».
Существенное для этого модуля:

- пересобирать **и `api`, и `web`**: страница кабинета и BFF-роуты живут в web;
- миграции применяются сами при старте контейнера
  (`CMD node dist/db/migrate.js && node dist/main.js`), отдельного шага нет;
- миграции копируются **внутрь образа** при сборке — поправить `.sql` в
  репозитории мало, образ надо пересобрать.

## Частые вопросы

**Почему curl по `/v1/platform/...` даёт 404?**
Он не проброшен наружу. Ходи через `/api/platform/...` с сессионной кукой либо
внутрь LXC на `http://localhost:3000/v1/platform/...`.

**Можно ли отменить выплату?**
Статус `cancelled` поддержан в журнале; отдельной ручки отмены пока нет — статус
меняется через `updatePayoutStatus` в сервисе.

**Сколько реквизитов можно завести?**
Сколько угодно, ограничения на один активный счёт каждого типа в схеме нет.

**Какие валюты?**
Сейчас только RUB (`currency` по умолчанию `'RUB'`).
