# Gatekeeper Platform — Deployment Guide

## 📦 Production Deployment на pve3

### Требования

- Docker & Docker Compose
- PostgreSQL 16
- Redis 7
- Node.js 22+
- 2GB+ RAM, 10GB+ disk

### 1. Подготовка сервера

```bash
# На pve3 (Proxmox)
ssh admin@smarthome.skud24.ru

# Клонировать репо
git clone https://github.com/shelkovoymb-wq/n8nHarness.git
cd n8nHarness/gatekeeper

# Скопировать и заполнить переменные
cp .env.example .env
# Заполнить все значения в .env (YooKassa, CloudPayments, Robokassa keys и т.д.)
nano .env
```

### 2. Build контейнеров

```bash
# API
docker build -t gatekeeper-api:latest -f apps/api/Dockerfile .

# Frontend
docker build -t gatekeeper-web:latest -f apps/web/Dockerfile .

# или используя compose:
docker-compose -f docker-compose.prod.yml build
```

### 3. Database миграции

```bash
# Запустить PostgreSQL
docker-compose -f docker-compose.prod.yml up -d postgres redis

# Дождаться готовности
sleep 5

# Запустить миграции
docker-compose -f docker-compose.prod.yml run --rm api pnpm db:migrate

# Проверить schema
docker-compose -f docker-compose.prod.yml exec postgres psql -U gatekeeper -d gatekeeper -c "\dt"
```

### 4. Запуск сервиса

```bash
# Запустить все сервисы
docker-compose -f docker-compose.prod.yml up -d

# Проверить статус
docker-compose -f docker-compose.prod.yml ps

# Логи
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f web
```

### 5. Регистрация Webhook URLs в провайдерах

#### YooKassa:
1. Dashboard: https://kassa.yookassa.ru/integration/merchant-settings
2. Webhook: `https://gatekeeper.skud24.ru/payments/webhook/yookassa`
3. Events: `payment_succeeded`, `payment_canceled`

#### CloudPayments:
1. Personal account: https://merchant.cloudpayments.ru
2. Webhook: `https://gatekeeper.skud24.ru/payments/webhook/cloudpayments`
3. Events: `Charge`, `Refund`

#### Robokassa:
1. Cabinet: https://auth.robokassa.ru/merchant
2. Webhook: `https://gatekeeper.skud24.ru/payments/webhook/robokassa`
3. Пароль 1: совпадает с ROBOKASSA_PASSWORD1

#### Telegram Stars:
- Автоматически через `successful_payment` update в Telegram webhook

### 6. Настройка n8n

```bash
# Создать API token в Gatekeeper UI (TODO)
# или использовать: sk_live_xxxxx

# В n8n создать 3 workflows:
# 1. Payment Success Workflow (см. docs/n8n-workflows/README.md)
# 2. Dunning Workflow
# 3. Reports Workflow

# Импортировать JSON с конфигами (готовятся в docs/n8n-workflows/)
```

### 7. Настройка Traefik (на pve3 с traefik-ha)

```yaml
# Добавить в traefik-ha конфиг:
gatekeeper:
  hosts:
    - gatekeeper.skud24.ru
  services:
    api: localhost:3000
    web: localhost:3001
```

### 8. Тестирование

```bash
# Проверить API
curl -X GET http://localhost:3000/health

# Проверить фронт
curl -X GET http://localhost:3001/

# Создать тестовый платёж
curl -X POST http://localhost:3000/payments/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test_client",
    "subscriberId": "test_sub",
    "subscriptionId": "test_subscription",
    "amount": 99900,
    "currency": "RUB",
    "provider": "yookassa",
    "description": "Test payment"
  }'
```

### 9. Мониторинг & Логирование

```bash
# Logs
docker-compose -f docker-compose.prod.yml logs -f api web

# Database
docker-compose -f docker-compose.prod.yml exec postgres psql -U gatekeeper -d gatekeeper

# Check payments
SELECT id, status, provider, amount FROM payments ORDER BY created_at DESC LIMIT 10;
```

### 10. Backup стратегия

```bash
# PostgreSQL backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U gatekeeper gatekeeper > backup.sql

# Redis backup (автоматический через AOF)
# Volume: redis_data:/data

# Скрипт backup.sh
#!/bin/bash
BACKUP_DIR="/backups/gatekeeper"
mkdir -p $BACKUP_DIR
docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U gatekeeper gatekeeper > $BACKUP_DIR/db_$(date +%Y%m%d_%H%M%S).sql
```

### 11. Масштабирование

```bash
# Горизонтальное масштабирование API:
docker-compose -f docker-compose.prod.yml up -d --scale api=3

# Балансировка через Traefik (автоматически)
```

### Checklist перед продакшеном

- [ ] Все переменные .env заполнены
- [ ] PostgreSQL запущена и инициализирована
- [ ] Redis работает
- [ ] API на порту 3000 отвечает на /health
- [ ] Frontend на порту 3001 загружается
- [ ] Webhooks зарегистрированы у всех провайдеров
- [ ] n8n workflows созданы и активны
- [ ] SSL сертификат настроен (через Traefik)
- [ ] Backup скрипты настроены
- [ ] Мониторинг включен

---

**Estimated deployment time: 30-45 минут**

**Support**: admin@gatekeeper.ru
