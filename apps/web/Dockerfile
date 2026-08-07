# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Не тянуть браузеры Playwright при установке (devDep) — иначе билд висит.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

RUN npm install -g pnpm

# Copy workspace files
COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# Install dependencies ОДИН раз (tolerant to lockfile drift)
RUN pnpm install --frozen-lockfile || pnpm install

# Build Next.js app
WORKDIR /app/apps/web
# next build статически «запекает» metadata (в т.ч. коды подтверждения сайта
# для Google/Яндекс) в prerendered HTML — их нужно передать ДО сборки, а не
# только в рантайм-окружение контейнера.
ARG GOOGLE_SITE_VERIFICATION=""
ARG YANDEX_VERIFICATION=""
ENV GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION
ENV YANDEX_VERIFICATION=$YANDEX_VERIFICATION
RUN mkdir -p public && pnpm build

# Runtime stage — переиспользуем node_modules из builder (без второй установки)
FROM node:20-alpine

WORKDIR /app

RUN npm install -g pnpm

# Забираем весь установленный и собранный /app из builder-стадии.
COPY --from=builder /app ./

WORKDIR /app/apps/web

# Health check — админка отдаёт 200 на /admin/stats
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/admin/stats',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

EXPOSE 3000

CMD ["pnpm", "start"]
