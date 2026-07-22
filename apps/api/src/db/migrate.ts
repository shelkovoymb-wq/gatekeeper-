/**
 * Простой раннер миграций: применяет все SQL-файлы из ./migrations по порядку,
 * отмечая применённые в _migrations. Запуск: `pnpm db:migrate` (или в entrypoint контейнера).
 * Когда подключим drizzle-kit generate — перейдём на его журнал; на Фазе 0 достаточно этого.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const sql = postgres(url, { max: 1 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;

    const dir = join(__dirname, 'migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const done = await sql`SELECT 1 FROM _migrations WHERE name = ${file}`;
      if (done.length > 0) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }
      const ddl = await readFile(join(dir, file), 'utf8');
      console.log(`apply ${file} ...`);
      await sql.unsafe(ddl);
      await sql`INSERT INTO _migrations (name) VALUES (${file})`;
      console.log(`ok    ${file}`);
    }
    console.log('migrations complete');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
