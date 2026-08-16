#!/bin/bash
# Выкатка на LXC "gatekeeper" (192.168.1.25, pve3).
# Запуск на самом хосте: bash deploy/pve3/deploy.sh
set -euo pipefail

GATEKEEPER_HOME="/opt/gatekeeper-src/gatekeeper"
COMPOSE="deploy/pve3/docker-compose.yml"

# На этом хосте docker поставлен Debian-пакетом docker.io, в который buildx не
# входит. Сборка через buildkit зависает намертво в futex_do_wait: логи
# показывают «DONE» по слоям, но образ не тегается и compose не завершается.
# Поэтому явно требуем legacy-билдер — он на этом хосте отрабатывает штатно.
export DOCKER_BUILDKIT=0
export COMPOSE_DOCKER_CLI_BUILD=0

if [ ! -d "$GATEKEEPER_HOME" ]; then
  echo "Не найден каталог $GATEKEEPER_HOME" >&2
  exit 1
fi
cd "$GATEKEEPER_HOME"

echo "==> Резервная копия текущего состояния"
tar czf "/opt/gk-backup-$(date +%Y%m%d-%H%M%S).tgz" \
  --exclude node_modules --exclude .next --exclude dist --exclude .git \
  -C /opt/gatekeeper-src gatekeeper

echo "==> Обновление кода из main"
# .env и deploy/pve3/.env не в индексе — reset --hard их не трогает.
git fetch --depth 1 origin main
git reset --hard FETCH_HEAD
git log --oneline -1

echo "==> Сборка образов"
# web обязателен вместе с api: страницы кабинета и BFF-роуты живут в нём,
# без пересборки web новые экраны в проде не появятся.
docker compose -f "$COMPOSE" build api web

echo "==> Перезапуск"
docker compose -f "$COMPOSE" up -d

echo "==> Ожидание готовности API"
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:3000/healthz >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "==> Состояние"
docker compose -f "$COMPOSE" ps
curl -s http://localhost:3000/healthz; echo
curl -s -o /dev/null -w 'web /owner/payouts -> %{http_code}\n' http://localhost:3001/owner/payouts

echo "==> Последние логи api"
docker compose -f "$COMPOSE" logs -n 30 api
