import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { AuthService } from './auth/auth.service.js';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn'],
    // Нужен сырой Buffer тела запроса для проверки HMAC-подписи платёжных вебхуков
    // (CloudPayments и т.п.) — после парсинга JSON байты теряются.
    rawBody: true,
  });

  // Telegram присылает JSON; тело апдейта нужно как есть.
  app.enableShutdownHooks();

  // За обратным прокси (nginx на .44) реальный IP клиента приходит в
  // X-Forwarded-For. Без trust proxy Express считает пиром сам nginx —
  // тогда rate limiting (ThrottlerGuard) бьёт по всем клиентам как по
  // одному IP вместо того, чтобы ограничивать конкретного атакующего.
  app.set('trust proxy', 1);

  // Гарантируем владельца платформы (идемпотентно), если задан в окружении.
  if (env.OWNER_EMAIL && env.OWNER_PASSWORD) {
    await app.get(AuthService).ensureOwner(env.OWNER_EMAIL, env.OWNER_PASSWORD);
    Logger.log(`owner ensured: ${env.OWNER_EMAIL}`, 'Bootstrap');
  }

  await app.listen(env.API_PORT, '0.0.0.0');
  Logger.log(
    `Gatekeeper API on :${env.API_PORT} (public: ${env.PUBLIC_API_URL})`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
