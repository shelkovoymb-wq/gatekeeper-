#!/bin/bash
# Быстрый деплой на pve3 LXC контейнер
# Запуск: bash deploy.sh  (или ssh root@192.168.1.25 'bash <(curl ...)')

set -e

echo "🚀 Gatekeeper Deploy на pve3"
echo "================================"

# На LXC контейнере
GATEKEEPER_HOME="/opt/gatekeeper-src/gatekeeper"

if [ ! -d "$GATEKEEPER_HOME" ]; then
  echo "❌ Не найдена директория $GATEKEEPER_HOME"
  exit 1
fi

cd "$GATEKEEPER_HOME"

echo "📥 Обновляю код из main..."
git fetch origin main
git checkout main
git reset --hard origin/main

echo "🔨 Пересобираю Docker образы..."
docker compose -f deploy/pve3/docker-compose.yml build --no-cache api

echo "🔄 Перезапускаю контейнеры..."
docker compose -f deploy/pve3/docker-compose.yml down
docker compose -f deploy/pve3/docker-compose.yml up -d

echo "⏳ Ожидание запуска сервисов..."
sleep 10

echo "✅ Проверяю статус..."
curl -s http://localhost:3000/health || curl -s http://localhost:3000/healthz || echo "API не ответила на health check"

echo ""
echo "✨ Деплой завершен!"
echo "📍 API доступна на: https://gatekeeper.skud24.ru"
echo ""
echo "🔍 Логи:"
docker compose -f deploy/pve3/docker-compose.yml logs -n 50 api
