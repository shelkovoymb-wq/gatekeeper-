import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get('healthz')
  async health() {
    let dbOk = false;
    try {
      await this.db.execute(sql`SELECT 1`);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'gatekeeper-api',
      db: dbOk,
      ts: new Date().toISOString(),
    };
  }
}
