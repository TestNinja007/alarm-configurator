/**
 * Production entry point: migrate, seed if asked to, then serve.
 *
 * Doing all three in one process keeps the deployment target simple — a host
 * only needs to run `node src/api/dist/boot.js` — and means the same sequence
 * runs under Docker and under a platform that just executes a start command.
 */
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool, queryOne } from './db/pool.js';
import { seed } from './seed/index.js';
import { buildServer } from './server.js';

async function databaseIsEmpty(): Promise<boolean> {
  const row = await queryOne<{ count: number }>('SELECT count(*)::bigint AS count FROM users');
  return (row?.count ?? 0) === 0;
}

async function maybeSeed(): Promise<string> {
  if (config.seedOnStart === 'never') return 'skipped (SEED_ON_START=never)';

  if (config.seedOnStart === 'if-empty' && !(await databaseIsEmpty())) {
    // Redeploying must not wipe a live instance.
    return 'skipped (database already has users)';
  }

  await seed(config.seedProfile);
  return `seeded the "${config.seedProfile}" profile`;
}

async function main(): Promise<void> {
  const applied = await migrate();
  console.log(
    applied.length === 0 ? 'Migrations: none pending' : `Migrations: applied ${applied.join(', ')}`,
  );
  console.log(`Seed: ${await maybeSeed()}`);

  const app = await buildServer();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      testSupport: config.testSupport,
      listDelayMs: config.listDelayMs,
      cookieSecure: config.cookieSecure,
    },
    'Alarm Configurator ready',
  );
}

main().catch((error: unknown) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
