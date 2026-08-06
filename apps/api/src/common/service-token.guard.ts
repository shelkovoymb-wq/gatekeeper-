import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** Сравнение без утечки по времени — длины разные считаем несовпадением сразу. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Простой Bearer-guard для внутренних управляющих эндпоинтов (/v1/*).
 * Принимает N8N_SERVICE_TOKEN (им же авторизуется n8n). На Фазе 1 этого достаточно;
 * позже кабинет клиента перейдёт на JWT с ролями.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const raw = req.headers['authorization'];
    const auth = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const expected = this.env.N8N_SERVICE_TOKEN;
    if (!expected || !token || !safeEqual(token, expected)) {
      throw new UnauthorizedException('invalid service token');
    }
    return true;
  }
}
