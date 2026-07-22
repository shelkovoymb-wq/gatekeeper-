import { Global, Module, type OnModuleDestroy, Inject } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import * as schema from './schema.js';

export const DB = Symbol('DB');
export const PG = Symbol('PG');

export type Database = PostgresJsDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: PG,
      useFactory: (env: Env) => postgres(env.DATABASE_URL, { max: 10 }),
      inject: [ENV],
    },
    {
      provide: DB,
      useFactory: (client: ReturnType<typeof postgres>) => drizzle(client, { schema }),
      inject: [PG],
    },
  ],
  exports: [DB, PG],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(PG) private readonly client: ReturnType<typeof postgres>) {}

  async onModuleDestroy() {
    await this.client.end({ timeout: 5 });
  }
}
