import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';
import { AuthService } from './auth/auth.service.js';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // Telegram присылает JSON; тело апдейта нужно как есть.
  app.enableShutdownHooks();

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
