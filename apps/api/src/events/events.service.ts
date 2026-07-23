import { Inject, Injectable } from '@nestjs/common';
import type { EventTopic } from '@gatekeeper/shared';
import { DB, type Database } from '../db/db.module.js';
import { outboxEvents } from '../db/schema.js';

/**
 * Транзакционный outbox доменных событий. Пишем событие здесь (в идеале — в той же
 * транзакции, что и доменное изменение), диспетчер доставит его в n8n.
 */
@Injectable()
export class EventsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async emit(
    topic: EventTopic,
    clientId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(outboxEvents).values({
      topic,
      clientId: clientId ?? null,
      payload,
      status: 'new',
    });
  }
}
