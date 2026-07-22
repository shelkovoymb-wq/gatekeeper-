import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { subscribers } from '../db/schema.js';

@Injectable()
export class SubscribersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Находит подписчика по Telegram-id или создаёт нового. */
  async upsert(input: {
    tgUserId: number;
    username?: string | null;
    firstName?: string | null;
    language?: string | null;
  }): Promise<{ id: string }> {
    const [existing] = await this.db
      .select({ id: subscribers.id })
      .from(subscribers)
      .where(eq(subscribers.tgUserId, input.tgUserId))
      .limit(1);
    if (existing) {
      await this.db
        .update(subscribers)
        .set({
          username: input.username ?? null,
          firstName: input.firstName ?? null,
          language: input.language ?? null,
        })
        .where(eq(subscribers.id, existing.id));
      return existing;
    }
    const [created] = await this.db
      .insert(subscribers)
      .values({
        tgUserId: input.tgUserId,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        language: input.language ?? null,
      })
      .returning({ id: subscribers.id });
    return created;
  }
}
