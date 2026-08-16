import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthContext, JwtPayload } from './auth.types.js';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  auth?: AuthContext;
}

/** JWT-guard для кабинета клиента (/v1/cabinet/*, /v1/auth/me). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const raw = req.headers['authorization'];
    const header = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('no token');
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      // Все токены платформы подписаны одним секретом, поэтому назначение
      // проверяем явно: промежуточный 2FA-токен и OAuth-state не должны
      // открывать кабинет. Отсутствие `typ` — токен, выпущенный до 2FA.
      if (payload.typ !== undefined && payload.typ !== 'access') {
        throw new UnauthorizedException('invalid token');
      }
      req.auth = {
        userId: payload.sub,
        clientId: payload.cid ?? null,
        role: payload.role,
        email: payload.email ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException('invalid token');
    }
  }
}

/** Параметр-декоратор: достаёт AuthContext, положенный guard-ом. */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<RequestLike>();
  if (!req.auth) throw new UnauthorizedException('not authenticated');
  return req.auth;
});
