import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as plain YYYY-MM-DD strings rather than JS Date objects.
// A calendar date has no instant, and letting node-postgres build a Date from
// one would drag the container's local time into the domain.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

// Return BIGINT (count(*)) as a number; our counts are far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number.parseInt(value, 10));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export type QueryParam = string | number | boolean | null | Date | object | readonly string[];

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParam[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/** Returns the first row, or undefined when the query matched nothing. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: QueryParam[] = [],
): Promise<T | undefined> {
  const result = await query<T>(text, params);
  return result.rows[0];
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Postgres error code for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const candidate = error as { code?: string; constraint?: string };
  if (candidate?.code !== UNIQUE_VIOLATION) return false;
  return constraint === undefined || candidate.constraint === constraint;
}
