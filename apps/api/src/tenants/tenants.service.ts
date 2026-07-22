import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { clients, platformPlans } from '../db/schema.js';

/**
 * Минимальные операции с тенантами для Фазы 1.
 * Полноценный биллинг/лимиты — Фаза 2 (platform-billing).
 */
@Injectable()
export class TenantsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Возвращает id первого клиента, создавая дефолтного на плане free при отсутствии. */
  async ensureDefaultClient(): Promise<string> {
    const [existing] = await this.db.select({ id: clients.id }).from(clients).limit(1);
    if (existing) return existing.id;

    const [free] = await this.db
      .select({ id: platformPlans.id })
      .from(platformPlans)
      .where(eq(platformPlans.code, 'free'))
      .limit(1);
    if (!free) throw new Error('platform_plans not seeded (run migrations)');

    const [created] = await this.db
      .insert(clients)
      .values({ name: 'Platform (default)', platformPlanId: free.id, planStatus: 'active' })
      .returning({ id: clients.id });
    return created.id;
  }
}
