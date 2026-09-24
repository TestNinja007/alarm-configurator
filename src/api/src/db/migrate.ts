/**
 * Applies every db/migrations/*.sql file that has not run yet, in filename
 * order, each inside its own transaction, recording it in schema_migrations.
 * Running it twice is a no-op.
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from '../config.js';
import { pool, withTransaction } from './pool.js';

const migrationsDir = resolve(repoRoot, 'db', 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function migrate(): Promise<string[]> {
  await ensureMigrationsTable();

  const applied = new Set(
    (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
      (row) => row.filename,
    ),
  );

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  const ran: string[] = [];

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = await readFile(resolve(migrationsDir, filename), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    });
    ran.push(filename);
  }

  return ran;
}

// Executed directly via `npm run migrate`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then((ran) => {
      console.log(
        ran.length === 0
          ? 'No pending migrations.'
          : `Applied ${ran.length} migration(s): ${ran.join(', ')}`,
      );
      return pool.end();
    })
    .catch((error: unknown) => {
      console.error('Migration failed:', error);
      process.exitCode = 1;
      return pool.end();
    });
}
