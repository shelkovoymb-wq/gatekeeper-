# ─── build stage ──────────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /repo

RUN corepack enable

# Манифесты для кеша установки
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile || pnpm install

# Исходники
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @gatekeeper/api build

# ─── runtime stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
RUN corepack enable

COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/packages/shared /repo/packages/shared
COPY --from=build /repo/apps/api/package.json /repo/apps/api/package.json
COPY --from=build /repo/apps/api/dist /repo/apps/api/dist
COPY --from=build /repo/apps/api/src/db/migrations /repo/apps/api/dist/db/migrations
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/api/node_modules /repo/apps/api/node_modules

WORKDIR /repo/apps/api
EXPOSE 3000

# Применяем миграции, затем стартуем API.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
