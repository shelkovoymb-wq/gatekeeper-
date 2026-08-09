# Ассистент по конфигурации платёжных систем

Интелектуальный ассистент помогает клиентам выбрать и настроить платёжные методы.

## Основные возможности

### 1. Автоматический выбор способа оплаты

**Endpoint:** `POST /payment-config/assistant/choose`

Система анализирует потребности вашего бизнеса и рекомендует лучший способ оплаты:

```bash
curl -X POST http://api.gatekeeper.ru/payment-config/assistant/choose \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "your-client-id",
    "businessType": "subscription",          # subscription | one-time | both
    "targetAudience": "russia-only",         # russia-only | international
    "technicalLevel": "beginner",             # beginner | intermediate | advanced
    "priorities": ["fast-setup", "low-commission"]
  }'
```

**Ответ:**
```json
{
  "recommendation": {
    "id": "prodamus",
    "name": "Prodamus",
    "description": "Российская платёжная система...",
    "setupTimeMinutes": 15,
    "commissionRate": "1.5% - 2.9%",
    "whyRecommended": "быстрая настройка (15 минут), низкая комиссия"
  },
  "alternativeOptions": [
    {
      "id": "yookassa",
      "name": "YooKassa",
      "setupTimeMinutes": 20
    }
  ],
  "nextStep": "Перейдите на /payment-config/methods/prodamus/guide для инструкций"
}
```

### 2. Пошаговый гайд по настройке

**Endpoint:** `POST /payment-config/assistant/setup-wizard`

Интерактивный помощник ведёт через каждый шаг настройки:

```bash
curl -X POST http://api.gatekeeper.ru/payment-config/assistant/setup-wizard \
  -H "Authorization: Bearer token" \
  -d '{
    "clientId": "your-client-id",
    "provider": "prodamus",
    "step": 0  # С какого шага начать?
  }'
```

**Ответ содержит:**
- Текущий шаг и общее количество шагов
- Подробное описание действий
- Примеры
- Ссылки на официальную документацию
- Видеогайды

```json
{
  "provider": "prodamus",
  "totalSteps": 5,
  "currentStep": 1,
  "step": {
    "step": 1,
    "title": "Регистрация на Prodamus",
    "description": "Перейдите на https://prodamus.ru и создайте аккаунт",
    "estimated_time_minutes": 2,
    "difficulty": "easy",
    "action": "https://prodamus.ru/register"
  },
  "requiredCredentials": [
    {
      "key": "apiKey",
      "label": "API Key",
      "example": "sk_live_xxxxxxxxx",
      "help": "Найдите в разделе API & Webhooks → API Keys"
    }
  ],
  "webhookUrl": "https://api.gatekeeper.ru/payments/webhook/prodamus",
  "nextAction": "Переходите к шагу 2",
  "helpLinks": {
    "official_docs": "https://prodamus.ru/api/",
    "support_chat": "https://t.me/gatekeeper_support",
    "video_guide": "https://youtube.com/results?search_query=gatekeeper+prodamus+setup"
  }
}
```

### 3. Интерактивный чат-ассистент

**Endpoint:** `POST /payment-config/assistant/chat`

Общайтесь с ассистентом на естественном языке:

```bash
curl -X POST http://api.gatekeeper.ru/payment-config/assistant/chat \
  -H "Authorization: Bearer token" \
  -d '{
    "clientId": "your-client-id",
    "message": "Как настроить Prodamus?"
  }'
```

#### Примеры вопросов:

**"Какой способ оплаты выбрать?"**
```json
{
  "type": "recommendation",
  "response": "Рекомендуем добавить: prodamus, yookassa, stars",
  "data": {
    "recommendation": "...",
    "availableToAdd": [...]
  }
}
```

**"Как настроить YooKassa?"**
```json
{
  "type": "setup_guide",
  "provider": "yookassa",
  "response": "Для настройки YooKassa потребуется примерно 20 минут",
  "steps": [
    {
      "step": 1,
      "title": "Создание аккаунта YooKassa",
      "description": "Перейдите на https://yookassa.ru и зарегистрируйтесь"
    }
  ],
  "fullGuideLink": "/payment-config/methods/yookassa/guide"
}
```

**"Какие комиссии?"**
```json
{
  "type": "pricing",
  "response": "Вот комиссии разных провайдеров:",
  "pricing": [
    {
      "name": "Prodamus",
      "commission": "1.5% - 2.9%",
      "settlement": "1-2 рабочих дня"
    },
    {
      "name": "YooKassa",
      "commission": "1.9% - 4.5%",
      "settlement": "1-2 рабочих дня"
    }
  ]
}
```

**"Сколько времени настраивается?"**
- Prodamus: 15 минут
- YooKassa: 20 минут
- CloudPayments: 15 минут
- Robokassa: 20 минут
- Telegram Stars: 2 минуты

### 4. Список всех доступных способов оплаты

**Endpoint:** `GET /payment-config/methods`

Получить полный список с описанием, комиссиями и временем настройки:

```bash
curl http://api.gatekeeper.ru/payment-config/methods \
  -H "Authorization: Bearer token"
```

**Ответ:**
```json
{
  "total": 5,
  "methods": [
    {
      "id": "prodamus",
      "name": "Prodamus",
      "description": "Российская платёжная система...",
      "setupTimeMinutes": 15,
      "commissionRate": "1.5% - 2.9%",
      "settlementTime": "1-2 рабочих дня",
      "supportedMethods": ["Карта Visa/MasterCard", "Яндекс.Касса", ...]
    }
  ]
}
```

### 5. Подробный гайд по конкретному провайдеру

**Endpoint:** `GET /payment-config/methods/:provider/guide`

```bash
curl http://api.gatekeeper.ru/payment-config/methods/yookassa/guide \
  -H "Authorization: Bearer token"
```

**Ответ содержит:**
- Полное описание
- Все 5 шагов настройки
- Список необходимых учётных данных
- URL для вебхуков
- Информацию о комиссиях и расчётах

## Управление конфигурациями

### Сохранить конфигурацию

**Endpoint:** `POST /payment-config/save`

```bash
curl -X POST http://api.gatekeeper.ru/payment-config/save \
  -H "Authorization: Bearer token" \
  -d '{
    "clientId": "your-client-id",
    "provider": "prodamus",
    "credentials": {
      "apiKey": "sk_live_xxxxxxxxx",
      "secretKey": "secret_xxxxxxxxx"
    }
  }'
```

### Валидировать конфигурацию перед сохранением

**Endpoint:** `POST /payment-config/validate`

```bash
curl -X POST http://api.gatekeeper.ru/payment-config/validate \
  -H "Authorization: Bearer token" \
  -d '{
    "provider": "yookassa",
    "credentials": {
      "shopId": "123456",
      "secretKey": "secret_key"
    }
  }'
```

### Получить текущие конфигурации клиента

**Endpoint:** `GET /payment-config/client/:clientId`

```bash
curl "http://api.gatekeeper.ru/payment-config/client/my-client" \
  -H "Authorization: Bearer token"
```

**Ответ:**
```json
{
  "clientId": "my-client",
  "totalConfigured": 2,
  "activeProviders": 2,
  "configs": [
    {
      "id": "cfg-uuid",
      "provider": "prodamus",
      "isActive": true,
      "setupTimeMinutes": 15,
      "name": "Prodamus"
    },
    {
      "id": "cfg-uuid",
      "provider": "yookassa",
      "isActive": true,
      "setupTimeMinutes": 20,
      "name": "YooKassa"
    }
  ]
}
```

### Отключить способ оплаты

**Endpoint:** `DELETE /payment-config/client/:clientId/provider/:provider`

```bash
curl -X DELETE "http://api.gatekeeper.ru/payment-config/client/my-client/provider/robokassa" \
  -H "Authorization: Bearer token"
```

### Получить рекомендацию для клиента

**Endpoint:** `GET /payment-config/client/:clientId/recommendation`

Система анализирует то, что уже настроено, и рекомендует добавить:

```bash
curl "http://api.gatekeeper.ru/payment-config/client/my-client/recommendation" \
  -H "Authorization: Bearer token"
```

**Ответ:**
```json
{
  "recommendation": "Рекомендуем добавить: cloudpayments, stars",
  "activeProviders": [
    {
      "id": "prodamus",
      "provider": "prodamus",
      "isActive": true
    }
  ],
  "availableToAdd": [
    {
      "id": "cloudpayments",
      "name": "CloudPayments",
      "setupTimeMinutes": 15
    }
  ]
}
```

## Примеры использования

### Сценарий 1: Начинающий пользователь

```bash
# 1. Клиент спрашивает у ассистента
POST /payment-config/assistant/chat
{
  "message": "С чего начать? Какой способ выбрать?"
}

# Ассистент рекомендует Prodamus как самый быстрый в настройке

# 2. Запрашивает пошаговый гайд
POST /payment-config/assistant/setup-wizard
{
  "provider": "prodamus",
  "step": 0
}

# 3. Ассистент ведёт через каждый шаг
# Пользователь копирует API Key и Secret Key

# 4. Сохраняет конфигурацию
POST /payment-config/save
{
  "clientId": "my-client",
  "provider": "prodamus",
  "credentials": {
    "apiKey": "sk_live_xxx",
    "secretKey": "secret_xxx"
  }
}

# 5. ✓ Prodamus настроена!
```

### Сценарий 2: Опытный пользователь ищет оптимальный вариант

```bash
# 1. Запрашивает рекомендацию с параметрами
POST /payment-config/assistant/choose
{
  "businessType": "subscription",
  "targetAudience": "international",
  "priorities": ["low-commission", "most-methods"]
}

# 2. Получает рекомендацию
# "Рекомендуем YooKassa: низкая комиссия, поддерживает 4 способа оплаты"

# 3. Смотрит полный гайд
GET /payment-config/methods/yookassa/guide

# 4. Настраивает все реквизиты и сохраняет
POST /payment-config/save
```

### Сценарий 3: Текущий клиент хочет добавить ещё способы

```bash
# 1. Спрашивает рекомендацию
GET /payment-config/client/my-client/recommendation

# Ответ: "У вас настроена Prodamus. Рекомендуем добавить YooKassa и Stars"

# 2. Запрашивает чат помощь
POST /payment-config/assistant/chat
{
  "message": "Как быстро добавить ещё один способ?"
}

# 3. Ассистент рекомендует Telegram Stars (2 минуты)

# 4. Сохраняет конфигурацию
POST /payment-config/save
```

## Интеграция с API платежей

После сохранения конфигурации:

1. Клиент может использовать провайдер в платежах:
```bash
POST /payments/initiate
{
  "provider": "prodamus",  # Только активные провайдеры
  "amount": 10000,
  ...
}
```

2. Все платежи автоматически используют сохранённые реквизиты

3. Вебхуки поступают на зарегистрированные URL

## Рекомендации по выбору

### Для начинающих (MVP)
**Telegram Stars** - самое быстрое, встроено в платформу

### Для русского рынка
**Prodamus** или **YooKassa** - быстрая настройка, поддержка РФ, низкие комиссии

### Для максимальной гибкости
**Prodamus + YooKassa** - разные методы оплаты, резервирование

### Для международной аудитории
**YooKassa** или **Prodamus** - поддержка иностранных карт

### Для наивысшей надёжности
**Telegram Stars + Prodamus + YooKassa** - 3 разных провайдера, резервирование

## Часто задаваемые вопросы

**Q: Сколько способов оплаты можно добавить?**
A: Неограниченно. Рекомендуем минимум 2-3 для резервирования.

**Q: Можно ли отключить способ оплаты?**
A: Да, отключение - это просто деактивация, данные сохранятся.

**Q: Что если забыл пароль для API?**
A: Зайдите на официальный сайт провайдера, восстановите пароль и обновите конфигурацию.

**Q: Сколько стоит использовать разные провайдеры?**
A: Платформа не берёт комиссию. Каждый провайдер берёт свою (см. документацию).

**Q: Как переключаться между провайдерами?**
A: Все активные провайдеры доступны одновременно. Покупатель выбирает способ оплаты.

---

*Документация актуальна для версии Gatekeeper 2.0+*
