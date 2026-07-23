# n8n Workflows для Gatekeeper Platform

## Workflows включены в платформу:

### 1. Payment Success Workflow
**Триггер**: Webhook от API (payment.succeeded event)

**Шаги**:
```
1. Получить webhook данные (paymentId, subscriptionId)
2. Вызвать API: GET /payments/{paymentId}
3. Обновить статус подписки в БД (activate)
4. Отправить welcome-сообщение в Telegram канал
5. Отправить invoice email на адрес клиента
6. Залогировать в analytics
```

**Настройка в n8n**:
- Webhook: `POST /webhook/payment.succeeded`
- Headers: `Authorization: Bearer {GATEKEEPER_API_TOKEN}`

### 2. Dunning Workflow (Retry Failed Payments)
**Триггер**: Schedule (каждый день в 06:00)

**Шаги**:
```
1. Выборка всех subscriptions со статусом grace_period
2. Для каждой: найти последний failed payment
3. Попытка повторного платежа (retry payment API)
4. Если успех:
   - Обновить subscription status → active
   - Отправить "Payment Recovered" email
5. Если fail (count >= 3):
   - Отправить notice email
   - Установить deadline для retry
   - Если deadline passed: deactivate subscription
```

**Настройка в n8n**:
- Cron: `0 6 * * *` (каждый день 06:00)
- Batch size: 100 subscriptions за раз

### 3. Reports Workflow
**Триггер**: Schedule (ежедневно 06:30, еженедельно пт 09:00)

**Шаги**:
```
1. Получить статистику за период (вчера/неделю)
   - Total revenue
   - Transaction count
   - Success rate
   - By provider breakdown
2. Генерировать PDF report
3. Создать графики (доход, методы платежей)
4. Отправить email админу (report@gatekeeper.ru)
5. Сохранить в S3/NAS для архива
```

**Настройка в n8n**:
- Daily cron: `0 6 * * *`
- Weekly cron: `0 9 * * 5`

## Webhook URLs для регистрации в провайдерах

```
YooKassa:
  - Webhook: https://gatekeeper.skud24.ru/payments/webhook/yookassa
  - Event: payment_succeeded, payment_canceled, payment_waiting_for_capture

CloudPayments:
  - Webhook: https://gatekeeper.skud24.ru/payments/webhook/cloudpayments
  - Event: Charge, Refund

Robokassa:
  - Webhook: https://gatekeeper.skud24.ru/payments/webhook/robokassa
  - Status: received (успех), failed

Telegram Stars:
  - Обработчик: update_handler в telegram-core-module
  - Events: pre_checkout_query, successful_payment
```

## Переменные окружения для n8n

```bash
# API
GATEKEEPER_API_URL=https://gatekeeper.skud24.ru
GATEKEEPER_API_TOKEN=sk_live_xxxxx

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@gatekeeper.ru
SMTP_PASS=xxxxx

# Admin
ADMIN_EMAIL=admin@gatekeeper.ru

# AWS/S3 for reports
AWS_ACCESS_KEY=xxxxx
AWS_SECRET_KEY=xxxxx
AWS_BUCKET=gatekeeper-reports
```

## Статус реализации

✅ Payment Success Workflow (READY)
✅ Dunning Workflow (READY)  
✅ Reports Workflow (READY)

Все workflows готовы к импорту в live n8n!
