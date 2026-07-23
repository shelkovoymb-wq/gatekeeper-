# Деплой Gatekeeper на pve3 (LXC) + proxy на traefik-ha

Топология:

```
Internet ──HTTPS──► Traefik (.44, traefik-ha)
                        │  Host(gatekeeper.skud24.ru), TLS le
                        ▼
                 gatekeeper-proxy (nginx, .44, /opt/gatekeeper-proxy)
                        │  proxy_pass http://192.168.1.25:3000
                        ▼
                 LXC "gatekeeper" на pve3 (192.168.1.25)
                 docker: api :3000  ├─ postgres:16 (internal)
                                    └─ redis:7    (internal)
```

Параметры LXC: **192.168.1.25/24, gw 192.168.1.1**, 3 ГБ RAM / 1 ГБ swap, 2 vCPU,
20 ГБ на `local-lvm`, Debian 12, `nesting=1` (docker), автозапуск.

## 1. Провижининг LXC (на pve3, root)

```bash
CTID=150
pveam update && pveam download local debian-12-standard_*_amd64.tar.zst   # если шаблона нет
pct create $CTID local:vztmpl/debian-12-standard_*_amd64.tar.zst \
  --hostname gatekeeper \
  --cores 2 --memory 3072 --swap 1024 \
  --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.1.25/24,gw=192.168.1.1 \
  --features nesting=1,keyctl=1 \
  --unprivileged 1 --onboot 1 --start 1
```

## 2. Docker внутри LXC

```bash
pct exec $CTID -- bash -lc '
  apt-get update && apt-get install -y ca-certificates curl git &&
  install -m0755 -d /etc/apt/keyrings &&
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc &&
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list &&
  apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
'
```

## 3. Выкатка gatekeeper (внутри LXC)

```bash
pct exec $CTID -- bash -lc '
  git clone <REPO_URL> /opt/gatekeeper-src &&
  cd /opt/gatekeeper-src/gatekeeper &&
  cp .env.example .env
  # заполнить .env: SECRET_ENCRYPTION_KEY, JWT_SECRET, POSTGRES_PASSWORD, N8N_*,
  # PUBLIC_API_URL=https://gatekeeper.skud24.ru
'
pct exec $CTID -- bash -lc 'cd /opt/gatekeeper-src/gatekeeper && docker compose -f deploy/pve3/docker-compose.yml up -d --build'
```

Проверка изнутри LXC: `curl -s http://localhost:3000/healthz`.

## 4. Proxy на traefik-ha (.44)

```bash
mkdir -p /opt/gatekeeper-proxy
# скопировать сюда nginx.conf и docker-compose.yml из этого каталога
cd /opt/gatekeeper-proxy && docker compose up -d
```

Traefik подхватит лейблы и выпустит TLS по HTTP-01. Проверка снаружи:
`curl https://gatekeeper.skud24.ru/healthz`.

## 5. Webhook Telegram

`PUBLIC_API_URL=https://gatekeeper.skud24.ru` → при `POST /v1/bots` бот получит
webhook `https://gatekeeper.skud24.ru/tg/webhook/<botId>`, который через Traefik →
gatekeeper-proxy → API. Ничего дополнительно настраивать не нужно.

## Реальные заметки по развёртыванию (пройдено)

Что отличалось от идеального пути и как решалось в этой лабе:

- **Egress лабы ломает TLS к download.proxmox.com** (перехват/пересборка сертификата).
  Поэтому шаблон LXC не качали из интернета, а скопировали с соседнего узла кластера:
  `scp root@192.168.1.20:/var/lib/vz/template/cache/debian-12-standard_12.12-1_amd64.tar.zst /var/lib/vz/template/cache/`.
  Registry (docker/npm/github) при этом с валидными сертификатами — сборка/пул работают.
- **IPv6 без маршрута вешает apt/pveam.** `deb.debian.org` резолвится в IPv6, а у LXC
  только IPv4 → apt висит. Решение: `apt-get -o Acquire::ForceIPv4=true ...` и строка
  `precedence ::ffff:0:0/96 100` в `/etc/gai.conf`. Docker/Node сами быстро откатываются на IPv4.
- **Docker:** ставили Debian-пакет `docker.io` (apt по http + GPG, иммунен к TLS-перехвату).
  Compose v2 (`docker compose`) в Debian нет — плагин скачали с GitHub в
  `/usr/local/lib/docker/cli-plugins/docker-compose`. Сборка — legacy-билдером
  (`DOCKER_BUILDKIT=0`), т.к. buildx в `docker.io` не входит.
- **Секреты `.env`** генерируются прямо в LXC (`openssl rand`). Посмотреть/забрать:
  `pct exec 150 -- cat /opt/gatekeeper-src/gatekeeper/.env`.
  `N8N_SERVICE_TOKEN` из него нужен для вызовов `/v1/*` (заголовок `Authorization: Bearer`).
- **`PLATFORM_BOT_TOKEN`** пуст — вписать токен бота платформы и перезапустить `api`,
  либо подключать боты клиентов через `POST /v1/bots`.

Состояние после развёртывания: LXC 150 (192.168.1.25), контейнеры `pve3-api-1` (:3000),
`pve3-postgres-1`, `pve3-redis-1`; proxy `gatekeeper-proxy` на .44; внешне —
`https://gatekeeper.skud24.ru/healthz` → `{"status":"ok","db":true}`.
