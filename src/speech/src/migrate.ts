import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from './config.js';

/**
 * Apply the speech service's migrations to its own schema.
 *
 * Its own ledger, in its own schema - `speech.schema_migrations`, separate from
 * the main API's. The two services evolve their data independently, and a
 * shared ledger would couple their deploys: neither could migrate without the
 * other's migrations being present.
 */

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, '..', 'migrations');

export async function migrate(databaseUrl: string, schema: string): Promise<string[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`The speech schema name must be a plain identifier, not "${schema}".`);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`SET search_path = ${schema}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text        PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const applied = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        (row) => row.filename,
      ),
    );

    const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
    const ran: string[] = [];

    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = await readFile(resolve(MIGRATIONS, filename), 'utf8');

      // Each file in its own transaction, so a failure leaves the schema at
      // the last migration that completed rather than half-way through one.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        ran.push(filename);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Speech migration ${filename} failed: ${(error as Error).message}`);
      }
    }

    return ran;
  } finally {
    await client.end();
  }
}

// Run directly: `npm run migrate --workspace @alarm/speech`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  if (!config.databaseUrl) {
    console.error('SPEECH_DATABASE_URL (or DATABASE_URL) is required to migrate.');
    process.exit(1);
  }
  migrate(config.databaseUrl, config.schema)
    .then((ran) => {
      console.log(
        ran.length
          ? `Speech: applied ${ran.length} migration(s): ${ran.join(', ')}`
          : 'Speech: migrations none pending',
      );
    })
    .catch((error: Error) => {
      console.error(error.message);
      process.exit(1);
    });
}
