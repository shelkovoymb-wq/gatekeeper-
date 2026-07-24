# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# Install dependencies (tolerant to lockfile drift)
RUN npm install -g pnpm && (pnpm install --frozen-lockfile || pnpm install)

# Build Next.js app
WORKDIR /app/apps/web
RUN pnpm build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files and dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

# Install production dependencies only (tolerant to lockfile drift)
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# Copy built application from builder
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000

CMD ["pnpm", "start"]
