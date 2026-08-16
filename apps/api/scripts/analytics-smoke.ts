/**
 * Дымовой прогон аналитики платформы на живом Postgres: сеет минимальный
 * набор данных и печатает отчёт. Проверяет то, что не ловит юнит-тест на
 * дубле drizzle, — что сам SQL корректен и считает ожидаемые суммы.
 *
 * ВНИМАНИЕ: скрипт делает TRUNCATE рабочих таблиц, поэтому запускается только
 * на тестовой базе и только с явным подтверждением:
 *
 *   DATABASE_URL=postgres://… ALLOW_TRUNCATE=1 tsx scripts/analytics-smoke.ts
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/db/schema.js';
import { PlatformAnalyticsService } from '../src/platform/platform-analytics.service.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('нужен DATABASE_URL');
if (process.env.ALLOW_TRUNCATE !== '1') {
  throw new Error(
    'скрипт очищает таблицы: запускайте только на тестовой базе с ALLOW_TRUNCATE=1',
  );
}

const client = postgres(url, { max: 2 });
const db = drizzle(client, { schema });

async function seed() {
  await client`truncate table payments, subscriptions, plan_channels, plans, channels, bots,
    platform_invoices, subscribers, clients, platform_plans restart identity cascade`;

  const [pro] = await client`insert into platform_plans (code, name, price_month, commission_pct)
    values ('pro', 'Pro', 4990, 10) returning id`;
  const [free] = await client`insert into platform_plans (code, name, price_month, commission_pct)
    values ('free', 'Free', 0, 0) returning id`;

  const [c1] = await client`insert into clients (name, platform_plan_id, plan_status)
    values ('Клуб инвесторов', ${pro.id}, 'active') returning id`;
  const [c2] = await client`insert into clients (name, platform_plan_id, plan_status)
    values ('Крипто-сигналы', ${free.id}, 'trialing') returning id`;

  const [b1] = await client`insert into bots (client_id, tg_bot_id, username, token_enc, webhook_secret)
    values (${c1.id}, 1, 'club_bot', 'enc', 'secret') returning id`;
  const [b2] = await client`insert into bots (client_id, tg_bot_id, username, token_enc, webhook_secret)
    values (${c2.id}, 2, 'nova_bot', 'enc', 'secret') returning id`;

  const [ch1] = await client`insert into channels (client_id, bot_id, tg_chat_id, title)
    values (${c1.id}, ${b1.id}, -1001, 'VIP-сигналы') returning id`;
  const [ch2] = await client`insert into channels (client_id, bot_id, tg_chat_id, title)
    values (${c1.id}, ${b1.id}, -1002, 'Разборы сделок') returning id`;
  const [ch3] = await client`insert into channels (client_id, bot_id, tg_chat_id, title)
    values (${c2.id}, ${b2.id}, -1003, 'Nova Signals') returning id`;

  // Тариф клиента 1 включает два канала — платёж по нему делится пополам.
  const [p1] = await client`insert into plans (client_id, name, price, period_days)
    values (${c1.id}, 'Месяц', 1000, 30) returning id`;
  const [p2] = await client`insert into plans (client_id, name, price, period_days)
    values (${c2.id}, 'Месяц Nova', 500, 30) returning id`;
  await client`insert into plan_channels (plan_id, channel_id) values (${p1.id}, ${ch1.id}), (${p1.id}, ${ch2.id}), (${p2.id}, ${ch3.id})`;

  const [s1] = await client`insert into subscribers (tg_user_id, username, first_name)
    values (778899, 'ivan', 'Иван') returning id`;
  const [s2] = await client`insert into subscribers (tg_user_id, username, first_name)
    values (990011, null, 'Марина') returning id`;

  const [sub1] = await client`insert into subscriptions (client_id, subscriber_id, plan_id, status)
    values (${c1.id}, ${s1.id}, ${p1.id}, 'active') returning id`;
  const [sub2] = await client`insert into subscriptions (client_id, subscriber_id, plan_id, status)
    values (${c2.id}, ${s2.id}, ${p2.id}, 'active') returning id`;

  const day = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();

  await client`insert into payments (client_id, subscription_id, subscriber_id, provider,
      provider_payment_id, amount, currency, status, kind, created_at)
    values
      (${c1.id}, ${sub1.id}, ${s1.id}, 'yookassa', 'yk-1', 1000, 'RUB', 'succeeded', 'purchase', ${day(3)}),
      (${c1.id}, ${sub1.id}, ${s1.id}, 'yookassa', 'yk-2', 1000, 'RUB', 'succeeded', 'renewal', ${day(1)}),
      (${c1.id}, ${sub1.id}, ${s1.id}, 'yookassa', 'yk-3', 1000, 'RUB', 'refunded', 'refund', ${day(1)}),
      (${c2.id}, ${sub2.id}, ${s2.id}, 'stars', 'st-1', 500, 'RUB', 'succeeded', 'purchase', ${day(2)}),
      (${c2.id}, ${sub2.id}, ${s2.id}, 'stars', 'st-2', 500, 'RUB', 'failed', 'purchase', ${day(2)})`;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  await client`insert into platform_invoices (client_id, period_start, period_end, amount, status, details)
    values (${c1.id}, ${monthStart.toISOString().slice(0, 10)},
      ${new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)},
      5190, 'pending',
      ${JSON.stringify({ subscriptionAmount: 4990, commissionAmount: 200, turnoverBase: 2000 })}::jsonb)`;

  return { c1: c1.id as string };
}

function assert(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (ожидали ${JSON.stringify(expected)})`}`);
  if (!ok) process.exitCode = 1;
}

const { c1 } = await seed();
const service = new PlatformAnalyticsService(db);
const report = await service.report({ from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10) });

assert('оборот', report.totals.turnover, 2500);
assert('комиссия', report.totals.commission, 200); // 2000×10% + 500×0%
assert('остаётся клиентам', report.totals.clientNet, 2300);
assert('успешных платежей', report.totals.paymentsCount, 3);
assert('плательщиков', report.totals.payers, 2);
assert('возвраты', report.totals.refunded, 1000);
assert('неуспешных', report.totals.failedCount, 1);
assert('счета платформы', report.totals.invoicedToClients, 5190);

assert('клиентов в разрезе', report.clients.length, 2);
assert('оборот топ-клиента', report.clients[0].turnover, 2000);
assert('комиссия топ-клиента', report.clients[0].commission, 200);
assert('каналов у топ-клиента', report.clients[0].channels, 2);

const vip = report.channels.find((c) => c.title === 'VIP-сигналы');
const razbor = report.channels.find((c) => c.title === 'Разборы сделок');
const nova = report.channels.find((c) => c.title === 'Nova Signals');
assert('оборот делится между каналами тарифа', [vip?.turnover, razbor?.turnover], [1000, 1000]);
assert('полный оборот тарифа виден отдельно', vip?.grossTurnover, 2000);
assert('канал второго клиента', nova?.turnover, 500);
assert(
  'сумма долей каналов = обороту',
  report.channels.reduce((s, c) => s + c.turnover, 0),
  report.totals.turnover,
);
assert('подписки канала', vip?.activeSubscriptions, 1);

assert('провайдеры', report.providers.map((p) => p.provider).sort(), ['stars', 'yookassa']);

const first = report.ledger.rows[0];
assert('реестр: кто заплатил', first.payerUsername ?? first.payerName, 'ivan');
assert('реестр: кому', first.clientName, 'Клуб инвесторов');
assert('реестр: каналы платежа', first.channels.sort(), ['VIP-сигналы', 'Разборы сделок']);
assert('реестр: комиссия платежа', first.commission, 100);

const byClient = await service.report({ clientId: c1, from: '2020-01-01' });
assert('фильтр по клиенту', byClient.totals.turnover, 2000);
assert('фильтр по клиенту: каналы', byClient.channels.length, 2);

const monthly = await service.report({ from: '2020-01-01', granularity: 'month' });
assert('месячная детализация', monthly.period.granularity, 'month');
assert(
  'сумма по корзинам = обороту',
  monthly.trend.reduce((s, p) => s + p.turnover, 0),
  2500,
);

console.log('\nдней в периоде:', report.period.days, '· детализация:', report.period.granularity);
await client.end({ timeout: 5 });
