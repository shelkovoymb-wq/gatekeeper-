/**
 * Мини-дубль drizzle для юнит-тестов: любой вызов возвращает сам себя, а `await`
 * забирает следующий заранее уложенный результат. Этого хватает, чтобы гонять
 * сервис без Postgres и при этом видеть, что именно он собирался записать.
 */
export interface FakeDb {
  /** Уложить результаты в порядке, в котором сервис будет их получать. */
  queue(...results: unknown[]): void;
  /** Все вызовы цепочки: { method, args }. */
  calls: { method: string; args: unknown[] }[];
  /** Аргументы n-го вызова конкретного метода (например values). */
  argsOf(method: string, index?: number): unknown[] | undefined;
  reset(): void;
}

export function createFakeDb(): { db: any; fake: FakeDb } {
  const results: unknown[] = [];
  const calls: { method: string; args: unknown[] }[] = [];

  const chain: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          const next = results.length > 0 ? results.shift() : [];
          return (resolve: (v: unknown) => void) => resolve(next);
        }
        // db.transaction(cb) — прогоняем колбэк на том же дубле, чтобы запросы
        // внутри транзакции попадали в тот же журнал вызовов и очередь ответов.
        if (prop === 'transaction') {
          return (cb: (tx: unknown) => unknown) => {
            calls.push({ method: 'transaction', args: [] });
            return Promise.resolve(cb(chain));
          };
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return chain;
        };
      },
    },
  );

  const fake: FakeDb = {
    queue: (...r: unknown[]) => {
      results.push(...r);
    },
    calls,
    argsOf: (method: string, index = 0) =>
      calls.filter((c) => c.method === method)[index]?.args,
    reset: () => {
      results.length = 0;
      calls.length = 0;
    },
  };

  return { db: chain, fake };
}
