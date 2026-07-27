import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { clients, clientUsers, platformPlans } from '../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';
import type { AuthContext, JwtPayload } from './auth.types.js';

interface RegisterInput {
  email: string;
  password: string;
  companyName: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string | null;
    role: string;
    clientId: string | null;
    companyName: string | null;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const password = input.password;
    const companyName = input.companyName.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('некорректный email');
    }
    if (password.length < 8) {
      throw new BadRequestException('пароль должен быть не короче 8 символов');
    }
    if (!companyName) {
      throw new BadRequestException('укажите название проекта');
    }

    const [existing] = await this.db
      .select({ id: clientUsers.id })
      .from(clientUsers)
      .where(eq(clientUsers.email, email))
      .limit(1);
    if (existing) throw new ConflictException('пользователь с таким email уже существует');

    const [free] = await this.db
      .select({ id: platformPlans.id })
      .from(platformPlans)
      .where(eq(platformPlans.code, 'free'))
      .limit(1);
    if (!free) throw new Error('platform_plans not seeded');

    const [client] = await this.db
      .insert(clients)
      .values({ name: companyName, platformPlanId: free.id, planStatus: 'trialing' })
      .returning({ id: clients.id });

    const passwordHash = await hashPassword(password);
    const [user] = await this.db
      .insert(clientUsers)
      .values({ clientId: client.id, role: 'client_admin', email, passwordHash })
      .returning({ id: clientUsers.id });

    return this.buildResult({
      userId: user.id,
      clientId: client.id,
      role: 'client_admin',
      email,
      companyName,
    });
  }

  async login(email0: string, password: string): Promise<AuthResult> {
    const email = email0.trim().toLowerCase();
    const [user] = await this.db
      .select({
        id: clientUsers.id,
        clientId: clientUsers.clientId,
        role: clientUsers.role,
        email: clientUsers.email,
        passwordHash: clientUsers.passwordHash,
      })
      .from(clientUsers)
      .where(eq(clientUsers.email, email))
      .limit(1);
    if (!user || !user.passwordHash) throw new UnauthorizedException('неверный email или пароль');
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('неверный email или пароль');

    const companyName = await this.companyName(user.clientId);
    return this.buildResult({
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      companyName,
    });
  }

  async me(auth: AuthContext) {
    const companyName = await this.companyName(auth.clientId);
    return {
      id: auth.userId,
      email: auth.email,
      role: auth.role,
      clientId: auth.clientId,
      companyName,
    };
  }

  private async companyName(clientId: string | null): Promise<string | null> {
    if (!clientId) return 'Платформа';
    const [c] = await this.db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    return c?.name ?? null;
  }

  private async buildResult(u: {
    userId: string;
    clientId: string | null;
    role: string;
    email: string | null;
    companyName: string | null;
  }): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: u.userId,
      cid: u.clientId,
      role: u.role,
      email: u.email,
    };
    const token = await this.jwt.signAsync(payload);
    return {
      token,
      user: {
        id: u.userId,
        email: u.email,
        role: u.role,
        clientId: u.clientId,
        companyName: u.companyName,
      },
    };
  }

  /** Утилита для сидов: гарантирует наличие владельца платформы (clientId=null). */
  async ensureOwner(email: string, password: string): Promise<void> {
    const e = email.trim().toLowerCase();
    const [existing] = await this.db
      .select({ id: clientUsers.id })
      .from(clientUsers)
      .where(and(eq(clientUsers.email, e), isNull(clientUsers.clientId)))
      .limit(1);
    if (existing) return;
    const passwordHash = await hashPassword(password);
    await this.db
      .insert(clientUsers)
      .values({ clientId: null, role: 'owner', email: e, passwordHash });
  }
}
