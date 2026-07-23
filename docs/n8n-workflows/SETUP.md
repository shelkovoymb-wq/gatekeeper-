# n8n Workflows Setup Guide

## 📁 Готовые Workflows

Все workflows находятся в `docs/n8n-workflows/exports/`:

1. `01-payment-success.json` — Активация подписки после платежа
2. `02-dunning.json` — Повторная попытка неудачных платежей
3. `03-reports.json` — Ежедневные отчёты

## 🚀 Импорт Workflows в n8n

### Вариант 1: Через UI (Рекомендуется)

1. **Откройте n8n**: https://n8n.skud24.ru
2. **Создайте новый workflow**: `File → New Workflow`
3. **Импортируйте JSON**: 
   - Menu → File → Import
   - Выберите `01-payment-success.json`
   - Click Import
4. **Повторите для остальных 2 workflows**

### Вариант 2: Через API

```bash
# Импорт workflow через n8n API
curl -X POST https://n8n.skud24.ru/api/v1/workflows \
  -H "Authorization: Bearer $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @docs/n8n-workflows/exports/01-payment-success.json
```

## ⚙️ Настройка Переменных Окружения

**В n8n Dashboard → Settings → Environment Variables:**

```
GATEKEEPER_API_TOKEN=sk_live_xxxxx
GATEKEEPER_API_URL=https://gatekeeper.skud24.ru

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@gatekeeper.ru
SMTP_PASS=app_password_xxxxx

ADMIN_EMAIL=admin@gatekeeper.ru
```

## 🔧 Workflow 1: Payment Success

**Что делает:**
```
Webhook: payment.succeeded
    ↓
GET /payments/{paymentId}
    ↓
POST /subscriptions/{subscriptionId}/activate
    ↓
Send Welcome Email + Log Analytics
```

**Настройка:**

1. Откройте workflow
2. Найдите узел "Webhook Trigger"
3. Скопируйте Webhook URL:
   ```
   https://n8n.skud24.ru/webhook/payment.succeeded
   ```
4. **Важно!** Зарегистрируйте этот URL в платежных системах:

   **YooKassa**: `https://kassa.yookassa.ru/integration/merchant-settings`
   - Webhook: `https://gatekeeper.skud24.ru/payments/webhook/yookassa`
   - Обработчик: отправить на n8n:
     ```
     https://n8n.skud24.ru/webhook/payment.succeeded
     ```

5. Нажмите "Activate" в n8n

## 🔧 Workflow 2: Dunning

**Что делает:**
```
Schedule: Daily 06:00
    ↓
GET /subscriptions?status=grace_period
    ↓
FOR EACH subscription:
    Retry Payment
    ↓
IF success:
    Activate + Send Welcome Email
IF fail:
    Send Failure Notice + Deactivate (if expired)
```

**Настройка:**

1. Откройте workflow
2. Найдите "Schedule Trigger (Daily 06:00)"
3. Установите время: **6:00 AM** (или удобное)
4. Проверьте условие в узле "Check Retry Success"
5. Нажмите "Activate"

**Запуск первый раз:** Right-click on workflow → Execute Workflow (для тестирования)

## 🔧 Workflow 3: Reports

**Что делает:**
```
Schedule: Daily 06:30
    ↓
GET /analytics?period=1d
    ↓
Generate HTML Report
    ↓
Send Email to Admin + Archive
```

**Настройка:**

1. Откройте workflow
2. Найдите "Daily Schedule (06:30)"
3. Установите время: **6:30 AM** (после Payment Success)
4. Узел "Generate Report HTML":
   - Проверьте что переменные ${stats.xxx} верные
   - Может потребоваться адаптация под вашу API структуру
5. Нажмите "Activate"

## 🧪 Тестирование Workflows

### Тест 1: Payment Success

```bash
# Имитировать webhook payment.succeeded
curl -X POST https://n8n.skud24.ru/webhook/payment.succeeded \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "test_123",
    "subscriptionId": "subc_456",
    "amount": 99900,
    "email": "test@example.com"
  }'

# Проверить в n8n: Executions → Должен быть зелёный результат
```

### Тест 2: Dunning

```bash
# Вручную запустить workflow
# В n8n: Right-click workflow → Execute Workflow
# Посмотреть результаты в Executions tab
```

### Тест 3: Reports

```bash
# Вручную запустить
# Проверить email admin@gatekeeper.ru на получение отчёта
```

## 🔴 Troubleshooting

### Workflow не активируется

**Проблема**: "Workflow not started"

**Решение**:
```
1. Check n8n logs: docker-compose logs n8n
2. Verify environment variables are set
3. Ensure credentials are configured
4. Restart n8n: docker-compose restart n8n
```

### Webhook не получает данные

**Проблема**: Payment webhook не вызывается

**Решение**:
```
1. Проверить Webhook URL в n8n правильный
2. Убедиться что YooKassa/CloudPayments webhook зарегистрирован правильно
3. В YooKassa dashboard → Settings → Webhooks → Add webhook
4. Выбрать events: payment_succeeded
5. Вставить URL: https://n8n.skud24.ru/webhook/payment.succeeded
6. Test webhook (есть кнопка в их UI)
```

### Email не отправляются

**Проблема**: SendGrid узлы падают

**Решение**:
```
1. Проверить SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
2. Убедиться что пароль - это App Password, а не обычный пароль
3. Если используется Gmail: 
   - Enable 2FA
   - Create App Password
   - Use App Password в SMTP_PASS
4. Проверить в n8n логи SendGrid ошибки
```

### API возвращает ошибки

**Проблема**: HTTP Request узлы возвращают 401/403

**Решение**:
```
1. Проверить GATEKEEPER_API_TOKEN в environment variables
2. Убедиться что токен действительный: 
   curl https://gatekeeper.skud24.ru/health \
     -H "Authorization: Bearer $TOKEN"
3. Если не работает - создать новый токен в Gatekeeper API
```

## 📊 Мониторинг Workflows

**В n8n Dashboard:**

1. **Executions** — История запусков всех workflows
2. **Monitor** — Real-time статус активных workflows
3. **Logs** — Детальные логи каждого выполнения

**Рекомендации:**

- Проверять Executions каждый день
- Смотреть на failed executations
- Настроить alerts на fails (опция в workflow settings)

## 🔐 Безопасность

**Не забудьте:**

```
1. ✅ Установить правильные Webhook URLs (HTTPS!)
2. ✅ Защитить Webhook authentication (если нужно)
3. ✅ Не писать secrets в workflow (только environment variables)
4. ✅ Регулярно менять GATEKEEPER_API_TOKEN
5. ✅ Проверять логи на утечки данных
```

## 📝 Дополнительные Настройки

### Добавить Slack Notifications

```
В каждом workflow добавить узел:
- Slack → Send Message
- On error → Send alert to #gatekeeper-alerts
```

### Добавить Webhook для ручного триггера платежа

```json
{
  "type": "webhook",
  "path": "manual-payment-success",
  "methods": ["POST"]
}
```

Использование:
```bash
curl -X POST https://n8n.skud24.ru/webhook/manual-payment-success \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "manual_123",
    "subscriptionId": "subc_456"
  }'
```

## ✅ Final Checklist

- [ ] Все 3 workflows импортированы
- [ ] Environment variables установлены
- [ ] Webhooks зарегистрированы в YooKassa/CloudPayments
- [ ] Payment Success workflow активирован и протестирован
- [ ] Dunning workflow активирован и протестирован
- [ ] Reports workflow активирован и протестирован
- [ ] Email отправляются корректно
- [ ] Логи показывают успешное выполнение
- [ ] Alerts настроены на failed executions

---

**Если возникли проблемы:**
1. Проверьте n8n логи: `docker-compose logs n8n`
2. Проверьте Gatekeeper API логи: `docker-compose logs api`
3. Проверьте что все environment variables установлены
4. Протестируйте API endpoints напрямую через curl

**Support**: admin@gatekeeper.ru
