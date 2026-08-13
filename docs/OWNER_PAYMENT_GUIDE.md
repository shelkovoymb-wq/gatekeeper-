# Owner Payment Accounts & Payouts Guide

Система управления платежными реквизитами и выплатами для владельца платформы.

## Обзор

Владелец платформы получает доход из двух источников:
1. **Абонентская плата** — месячный платеж за использование тарифа
2. **Комиссия от оборота** — процент от платежей клиентов

Система автоматически:
- Генерирует счета клиентам (1-го числа в 03:00 UTC)
- Позволяет владельцу регистрировать платежные счета
- Создавать и отслеживать выплаты

## Архитектура

### Платежные счета владельца (owner_payment_accounts)

Поддерживаемые типы счетов:

| Тип | Реквизиты | PCI Compliant |
|-----|-----------|---------------|
| `bank_account` | BIC, INN, SWIFT, №счета | ✓ |
| `card` | Только последние 4 цифры | ✓ |
| `sbp` | Номер телефона | ✓ |
| `paypal` | Email | ✓ |
| `crypto` | Адрес кошелька | ✓ |

### Состояния счета

```
unverified → pending → verified
                  ↓
               rejected
```

- **unverified**: Новый счет, требует верификации
- **pending**: На рассмотрении
- **verified**: Проверен и активен
- **rejected**: Отклонен (не может быть использован)

### Выплаты (owner_payouts)

Статусы выплаты:

```
pending → processing → completed
    ↓                       ↑
  failed ←─────────────────┘
    ↓
cancelled
```

- **pending**: Создана, ожидает отправки
- **processing**: Отправляется на счет
- **completed**: Успешно зачислена
- **failed**: Ошибка при отправке
- **cancelled**: Отменена вручную

## API

### Управление платежными счетами

#### Добавить счет

```bash
POST /owner/payment-accounts

# Bank Account
{
  "accountType": "bank_account",
  "bankName": "Sberbank",
  "accountNumber": "40817810638050123456",
  "bic": "044525225",
  "inn": "7707083893",
  "sortCode": "123-456",  # опционально
  "swiftCode": "SABRRUMMSC"  # опционально
}

# Card
{
  "accountType": "card",
  "cardLast4": "4242",
  "cardHolder": "Ivan Petrov"
}

# SBP (Russian Instant Payments)
{
  "accountType": "sbp",
  "phoneSbp": "+79991234567"
}

# PayPal
{
  "accountType": "paypal",
  "paypalEmail": "owner@example.com"
}

# Crypto
{
  "accountType": "crypto",
  "cryptoAddress": "1A1z7agoat4xFG8hE7Ezuw9wVoPz6ecyAD",
  "cryptoType": "btc"  # btc | eth | usdt
}
```

**Response:**
```json
{
  "id": "acc_7f8a9b2c",
  "accountType": "bank_account",
  "bankName": "Sberbank",
  "accountNumber": "****0123456",  # Masked
  "bic": "044525225",
  "isActive": true,
  "verificationStatus": "pending",
  "verifiedAt": null,
  "createdAt": "2026-08-13T15:00:00Z"
}
```

#### Получить список счетов

```bash
GET /owner/payment-accounts

Response: [
  {
    "id": "acc_1",
    "accountType": "bank_account",
    "verificationStatus": "verified",
    "isActive": true,
    ...
  }
]
```

#### Получить детали счета

```bash
GET /owner/payment-accounts/:id
```

#### Верифицировать счет

```bash
POST /owner/payment-accounts/:id/verify

Response: {
  "id": "acc_1",
  "verificationStatus": "verified",
  "verifiedAt": "2026-08-13T15:05:00Z"
}
```

#### Отключить счет

```bash
DELETE /owner/payment-accounts/:id

Response: {
  "id": "acc_1",
  "isActive": false
}
```

### Управление выплатами

#### Создать выплату

```bash
POST /owner/payouts

{
  "accountId": "acc_7f8a9b2c",
  "invoiceIds": ["inv_1", "inv_2", "inv_3"],
  "amount": 145000
}
```

**Требования:**
- Account должен быть **verified**
- Account должен быть **active**
- Сумма должна быть > 0
- invoiceIds — массив ID счетов, которые покрывает эта выплата

**Response:**
```json
{
  "id": "payout_abc123",
  "accountId": "acc_7f8a9b2c",
  "invoiceIds": ["inv_1", "inv_2", "inv_3"],
  "amount": "145000",
  "currency": "RUB",
  "status": "pending",
  "createdAt": "2026-08-13T15:00:00Z"
}
```

#### Получить список выплат

```bash
GET /owner/payouts

Response: [
  {
    "id": "payout_abc123",
    "status": "completed",
    "amount": 145000,
    "completedAt": "2026-08-13T15:30:00Z"
  }
]
```

#### Получить детали выплаты

```bash
GET /owner/payouts/:id

Response: {
  "id": "payout_abc123",
  "accountId": "acc_7f8a9b2c",
  "invoiceIds": ["inv_1", "inv_2", "inv_3"],
  "amount": 145000,
  "status": "completed",
  "completedAt": "2026-08-13T15:30:00Z",
  "createdAt": "2026-08-13T15:00:00Z"
}
```

#### Получить статистику выплат

```bash
GET /owner/payouts-stats

Response: {
  "pending": 2,
  "processing": 1,
  "completed": 45,
  "failed": 2,
  "totalAmount": 6750000
}
```

## Жизненный цикл

### 1. Регистрация платежного счета

```bash
POST /owner/payment-accounts
→ Создается счет со статусом "pending"
```

### 2. Верификация счета

```bash
POST /owner/payment-accounts/:id/verify
→ Счет получает статус "verified"
→ Теперь можно использовать для выплат
```

### 3. Создание выплаты

```bash
POST /owner/payouts
→ Выплата создается со статусом "pending"
→ Привязывается к платежному счету
→ Отслеживается история событий
```

### 4. Обработка выплаты

- **pending** → Ждет отправки на счет
- **processing** → Отправляется платежной системе
- **completed** → Деньги зачислены владельцу
- **failed** → Ошибка, требует пересбора

## Примеры использования

### Сценарий 1: Настройка платежа на карту

```bash
# 1. Добавить счет карты
curl -X POST https://api.gatekeeper.ru/owner/payment-accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountType": "card",
    "cardLast4": "4242",
    "cardHolder": "Aleksandr Ivanov"
  }'
# → acc_123

# 2. Верифицировать счет
curl -X POST https://api.gatekeeper.ru/owner/payment-accounts/acc_123/verify \
  -H "Authorization: Bearer $TOKEN"

# 3. Создать выплату
curl -X POST https://api.gatekeeper.ru/owner/payouts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "accountId": "acc_123",
    "invoiceIds": ["inv_jul_client1", "inv_jul_client2"],
    "amount": 50000
  }'
# → payout_xyz
```

### Сценарий 2: Выплата на банковский счет

```bash
# Полные реквизиты банка
curl -X POST https://api.gatekeeper.ru/owner/payment-accounts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "accountType": "bank_account",
    "bankName": "Sberbank",
    "accountNumber": "40817810638050123456",
    "bic": "044525225",
    "inn": "7707083893",
    "swiftCode": "SABRRUMMSC"
  }'

# Верифицировать и использовать
```

### Сценарий 3: Выплата криптовалютой

```bash
curl -X POST https://api.gatekeeper.ru/owner/payment-accounts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "accountType": "crypto",
    "cryptoAddress": "1A1z7agoat4xFG8hE7Ezuw9wVoPz6ecyAD",
    "cryptoType": "btc"
  }'
```

## Безопасность

### PCI DSS Compliance

- ✅ Номера карт **не хранятся** (только последние 4 цифры)
- ✅ Чувствительные данные **зашифрованы** в БД
- ✅ Все операции **логируются** для аудита
- ✅ Доступ **только для owner** role

### Верификация счетов

- Каждый счет требует верификации перед использованием
- Администратор платформы должен проверить реквизиты вручную
- Статус верификации отслеживается и логируется

### История выплат

```bash
# Каждая выплата имеет audit trail:
- initiated: Выплата создана
- processing: Отправляется
- completed: Успешно
- failed: Ошибка (с описанием)
- cancelled: Отменена
```

## Миграции

### Migration 0004_owner_payment_accounts.sql

Создает 3 новые таблицы:

1. **owner_payment_accounts** - Платежные счета
   - id (UUID)
   - account_type (bank_account | card | sbp | paypal | crypto)
   - verification_status (pending | verified | rejected)
   - credentials_enc (зашифрованные реквизиты)
   - Индексы: (is_active, verification_status), (account_type)

2. **owner_payouts** - Выплаты
   - id (UUID)
   - account_id (FK)
   - invoice_ids (JSON array)
   - status (pending | processing | completed | failed)
   - amount (numeric)
   - Индексы: (status, created_at DESC), (account_id)

3. **owner_payout_events** - История выплат
   - id (bigserial)
   - payout_id (FK)
   - event (initiated | processing | completed | failed | cancelled)
   - details (jsonb)
   - created_at

## Тестирование

### Unit Tests

```bash
# Service Tests
apps/api/src/owner/owner-payouts.service.spec.ts

# Controller Tests
apps/api/src/owner/owner-payouts.controller.spec.ts
```

**Покрытие:**
- ✓ Добавление платежного счета
- ✓ Верификация счета
- ✓ Валидация данных
- ✓ Создание выплаты
- ✓ Отслеживание статуса
- ✓ Авторизация (только owner)
- ✓ Обработка ошибок

### Запуск тестов

```bash
npm run typecheck
```

## Развертывание

1. **Database Migration**
   ```bash
   pnpm --filter @gatekeeper/api db:migrate
   ```

2. **Deployment**
   ```bash
   git push origin main
   ```

3. **API становится доступным:**
   - `/owner/payment-accounts`
   - `/owner/payouts`
   - `/owner/payouts-stats`

## Мониторинг

### Метрики для отслеживания

```bash
GET /owner/payouts-stats
```

- **pending**: Выплаты в очереди
- **processing**: Отправляются сейчас
- **completed**: Успешно зачислены
- **failed**: Ошибки (требуют внимания)
- **totalAmount**: Общая сумма выплачено

### Логирование

Все операции логируются через `OwnerPayoutsService` logger:
- Создание счета
- Верификация
- Создание выплаты
- Обновление статуса
- Ошибки и исключения

## FAQ

**Q: Когда владелец получает выплаты?**
A: Когда статус payout = 'completed'. Платежная система отправляет деньги в течение 1-3 дней.

**Q: Можно ли отменить выплату?**
A: Да, если статус = 'pending'. После 'processing' отмена требует обращения к платежной системе.

**Q: Какие валюты поддерживаются?**
A: Сейчас RUB. Расширение возможно через добавление поля `currency` в owner_payouts.

**Q: Где хранятся номера карт?**
A: Только последние 4 цифры + зашифрованные полные реквизиты. PCI DSS compliant.

**Q: Сколько счетов может быть?**
A: Неограниченно. Можно использовать несколько параллельно.

---

*Документация актуальна для версии Gatekeeper 2.0+*
