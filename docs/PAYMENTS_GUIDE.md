# Платёжные системы Gatekeeper

Платформа поддерживает несколько способов приёма платежей:

## Провайдеры платежей

### 1. Prodamus (Новый)
Российская платёжная система для приёма платежей с карт и электронных кошельков.

**Конфигурация:**
```env
PRODAMUS_API_KEY_CLIENT_1=api_key_xxx
PRODAMUS_SECRET_KEY_CLIENT_1=secret_key_xxx
```

**Использование:**
```bash
POST /payments/initiate
{
  "clientId": "CLIENT_1",
  "amount": 10000,          # в копейках (100.00 RUB)
  "currency": "RUB",
  "provider": "prodamus",
  "description": "Подписка на премиум канал"
}
```

**Webhook:** `POST /payments/webhook/prodamus`

---

### 2. Прямые переводы (Новый)
Позволяет подписчикам переводить деньги напрямую на карту или счёт владельца канала, при этом **все платежи учитываются на платформе**.

**Поддерживаемые методы:**
- 💳 Карта (Visa/MasterCard)
- 🏦 Банковский счёт
- 💸 СБП (P2P-переводы)
- 📱 PayPal

#### Для владельца канала:

**1. Создание платёжного счёта**

```bash
POST /payment-accounts
Authorization: Bearer <token>
{
  "clientId": "owner-client-id",
  "accountType": "card",
  "cardNumberMasked": "**** **** **** 1234",
  "cardHolder": "Иван Петров"
}
```

**Ответ:**
```json
{
  "id": "acc-uuid",
  "accountType": "card",
  "verificationStatus": "pending",
  "message": "Account created. Awaiting admin verification."
}
```

**2. Admin верификация**
```bash
POST /payment-accounts/:accountId/verify
Authorization: Bearer <admin-token>
{
  "status": "verified"
}
```

После верификации счёт становится активным и доступен для приёма платежей.

#### Для подписчика:

**1. Инициирование платежа**
```bash
POST /payments/initiate
{
  "clientId": "subscriber-id",
  "subscriberId": "subscriber-id",
  "amount": 10000,
  "currency": "RUB",
  "provider": "direct",
  "description": "Подписка на канал",
  "metadata": {
    "payeeClientId": "owner-client-id"
  }
}
```

**Ответ содержит инструкцию:**
```json
{
  "paymentId": "dir_1723132800_abc123xyz",
  "url": null,
  "status": "pending",
  "instruction": {
    "amount": "100.00",
    "currency": "RUB",
    "accountType": "card",
    "cardNumberMasked": "**** **** **** 1234",
    "cardHolder": "Иван Петров"
  }
}
```

**2. Подписчик переводит деньги**
- Открывает мобильное приложение банка / Сбербанк Онлайн
- Вводит реквизиты из инструкции
- Переводит сумму
- (Опционально) Указывает paymentId в назначении платежа

**3. Подтверждение платежа**

Платформа может подтвердить платёж несколькими способами:

**a) Вебхук от банка:**
```bash
POST /payments/webhook/direct
{
  "payment_id": "dir_1723132800_abc123xyz",
  "order_id": "dir_1723132800_abc123xyz",
  "status": "completed",
  "amount": 100.00,
  "currency": "RUB",
  "reference": "bank_transaction_ref_123"
}
```

**b) Ручное подтверждение (администратором):**
```bash
# Администратор видит платёж со статусом PENDING
GET /payments?clientId=subscriber-id

# После получения уведомления от банка/подписчика подтверждает платёж
POST /payments/webhook/direct
{
  "payment_id": "dir_1723132800_abc123xyz",
  "status": "completed"
}
```

---

### 3. Существующие провайдеры

#### YooKassa
```env
YOOKASSA_SHOP_ID_CLIENT_1=123456
YOOKASSA_SECRET_CLIENT_1=secret_key
```

#### CloudPayments
```env
CLOUDPAYMENTS_PUBLIC_ID_CLIENT_1=pk_test_xxx
CLOUDPAYMENTS_API_SECRET_CLIENT_1=api_secret_key
```

#### Робокасса
```env
ROBOKASSA_MERCHANT_LOGIN_CLIENT_1=merchant_login
ROBOKASSA_PASSWORD1_CLIENT_1=password1
ROBOKASSA_PASSWORD2_CLIENT_1=password2
```

#### Telegram Stars
- Встроено автоматически
- Используется для платежей в Telegram

---

## API Endpoints

### Инициирование платежа
```bash
POST /payments/initiate
Authorization: Bearer <token>
{
  "clientId": "...",
  "subscriberId": "...",
  "subscriptionId": "...",
  "amount": 10000,
  "currency": "RUB",
  "provider": "prodamus|direct|yookassa|...",
  "description": "...",
  "metadata": {...}
}
```

### Вебхуки (Public)
```bash
POST /payments/webhook/:provider
```

Вебхук-эндпоинты для каждого провайдера:
- `/payments/webhook/prodamus`
- `/payments/webhook/direct`
- `/payments/webhook/yookassa`
- `/payments/webhook/cloudpayments`
- `/payments/webhook/robokassa`

### Получение платежа
```bash
GET /payments/:paymentId
Authorization: Bearer <token>
```

### Список платежей клиента
```bash
GET /payments?clientId=...&limit=50&offset=0
Authorization: Bearer <token>
```

### Возврат средств
```bash
POST /payments/:paymentId/refund
Authorization: Bearer <token>
{
  "amount": 5000,           # опционально (в копейках)
  "reason": "User request"  # опционально
}
```

### Управление платёжными счётами (Direct)
```bash
# Создание
POST /payment-accounts
{
  "clientId": "...",
  "accountType": "card|bank_account|sbp|paypal",
  ...
}

# Получение
GET /payment-accounts/:accountId

# Список по клиенту
GET /payment-accounts/client/:clientId

# Обновление
PUT /payment-accounts/:accountId

# Деактивация
DELETE /payment-accounts/:accountId

# Верификация (Admin)
POST /payment-accounts/:accountId/verify
{
  "status": "verified|rejected",
  "reason": "..."
}
```

---

## Архитектура

### Таблицы БД

**payments**
- `id` - ID платежа
- `clientId` - Клиент, который получает деньги
- `subscriberId` - Подписчик, который платит
- `subscriptionId` - Подписка
- `provider` - Используемый провайдер
- `providerPaymentId` - ID в системе провайдера
- `amount` - Сумма в копейках
- `currency` - Валюта
- `status` - pending|succeeded|failed|refunded
- `kind` - purchase|renewal|refund
- `metadata` - Дополнительные данные
- `createdAt`, `updatedAt` - Сроки

**direct_payment_accounts** (для Direct)
- `id` - ID счёта
- `clientId` - Владелец
- `accountType` - Тип счёта
- `verificationStatus` - unverified|pending|verified|rejected
- Реквизиты в зависимости от типа

---

## Безопасность

✅ **Все платежи:**
- ✓ Подписываются криптографически
- ✓ Логируются с полным audit trail
- ✓ Требуют верификации для Direct-счётов
- ✓ Хранятся в зашифрованном виде

✅ **Вебхуки:**
- ✓ Проверка подписи HMAC
- ✓ Проверка по API провайдера
- ✓ Идемпотентность (одинаковый платёж не обработается дважды)

✅ **Direct платежи:**
- ✓ Номера карт маскированы (хранятся только последние 4 цифры)
- ✓ Требуется admin верификация
- ✓ Полная история изменений счётов
- ✓ Мягкое удаление (архивирование)

---

## Примеры использования

### Сценарий 1: Подписка через Prodamus

```bash
# 1. Инициируем платёж
curl -X POST http://localhost:3000/payments/initiate \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "acme-corp",
    "subscriberId": "tg-user-123",
    "amount": 29900,
    "currency": "RUB",
    "provider": "prodamus",
    "description": "Premium subscription for 1 month"
  }'

# Получаем URL для перенаправления
# {
#   "paymentId": "prod_1723132800_xyz",
#   "url": "https://prodamus.ru/pay?...",
#   "status": "pending"
# }

# 2. Пользователь переходит по ссылке и платит
# 3. Prodamus отправляет вебхук
# 4. Статус платежа обновляется на succeeded
# 5. Подписка активируется
```

### Сценарий 2: Подписка через Direct платёж (СБП)

```bash
# 1. Владелец настраивает счёт (один раз)
curl -X POST http://localhost:3000/payment-accounts \
  -H "Authorization: Bearer owner-token" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "my-channel-owner",
    "accountType": "sbp",
    "phoneForSbp": "+79991234567"
  }'

# 2. Администратор верифицирует
curl -X POST http://localhost:3000/payment-accounts/acc-uuid/verify \
  -H "Authorization: Bearer admin-token" \
  -d '{"status": "verified"}'

# 3. Подписчик инициирует платёж
curl -X POST http://localhost:3000/payments/initiate \
  -H "Authorization: Bearer subscriber-token" \
  -d '{
    "clientId": "subscriber",
    "amount": 29900,
    "currency": "RUB",
    "provider": "direct",
    "metadata": {"payeeClientId": "my-channel-owner"}
  }'

# Получаем инструкцию:
# {
#   "paymentId": "dir_1723132800_abc",
#   "url": null,
#   "status": "pending",
#   "instruction": {
#     "accountType": "sbp",
#     "phoneNumber": "+79991234567",
#     "amount": "299.00"
#   }
# }

# 4. Подписчик открывает банк, переводит деньги
# 5. Платформа получает вебхук от банка
# 6. Статус платежа → succeeded, подписка активируется
```

---

## Миграция данных

При добавлении нового провайдера:

```bash
# 1. Добавить конфиг в .env
PROVIDER_API_KEY_CLIENT_1=xxx
PROVIDER_SECRET_CLIENT_1=yyy

# 2. Создать провайдер в apps/api/src/payments/providers/
# Реализовать PaymentProviderAdapter

# 3. Зарегистрировать в payments.module.ts
# Зарегистрировать в payments.service.ts

# 4. Добавить endpoint в платёжный контроллер (если нужно)

# 5. Протестировать вебхуки
```

---

## Troubleshooting

### Платёж застрял в статусе PENDING

1. Проверить статус в системе провайдера
2. Для Direct: убедиться, что счёт верифицирован
3. Отправить вебхук вручную (если необходимо)
4. Проверить логи: `journalctl -u gatekeeper-api`

### Вебхук не обработан

1. Проверить подпись (`Content-HMAC` для CloudPayments, `X-Prodamus-Signature` для Prodamus)
2. Убедиться, что raw body передан корректно
3. Проверить, что платёж ещё не обработан (идемпотентность)
4. Убедиться, что клиент конфигурирован

### Refund не работает

Некоторые провайдеры требуют ручной реализации возврата. Проверьте документацию провайдера.

---

## Ссылки

- [Prodamus API](https://prodamus.ru/api/)
- [YooKassa Documentation](https://yookassa.ru/developers)
- [CloudPayments API](https://cloudpayments.ru/Docs/API)
- [Робокасса](https://www.robokassa.ru/ru/Doc/Asp/Integration.aspx)
