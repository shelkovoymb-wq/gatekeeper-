import { z } from 'zod';

/** Валидация окружения при старте — падаем рано и с понятной ошибкой. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3000),

  PUBLIC_API_URL: z.string().url(),
  PUBLIC_APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // base64 от 32 байт
  SECRET_ENCRYPTION_KEY: z.string().min(1),

  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  N8N_EVENTS_WEBHOOK_URL: z.string().url().optional(),
  N8N_SERVICE_TOKEN: z.string().optional(),

  PLATFORM_BOT_TOKEN: z.string().optional(),

  // Владелец платформы (role=owner). Если заданы — на старте гарантируется
  // наличие owner-аккаунта (идемпотентно, ensureOwner).
  OWNER_EMAIL: z.string().email().optional(),
  OWNER_PASSWORD: z.string().min(8).optional(),

  // ИИ-ассистент настройки. Если ключа нет — ассистент работает в guided-режиме.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-haiku-latest'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
