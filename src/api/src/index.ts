import { config } from './config.js';
import { pool } from './db/pool.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
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
    { testSupport: config.testSupport, listDelayMs: config.listDelayMs },
    'Alarm Configurator ready',
  );
}

main().catch((error: unknown) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
