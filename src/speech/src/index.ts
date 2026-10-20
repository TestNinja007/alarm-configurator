import { loadConfig } from './config.js';
import { migrate } from './migrate.js';
import { buildServer } from './server.js';
import { PostgresAudioStore } from './store.js';

/**
 * Start the speech service: migrate its schema, then listen.
 *
 * It refuses to start without a service token or a database. Starting without
 * a token would mean an open, metered text-to-speech endpoint for anyone who
 * could reach the port; starting without a database would mean a cache that
 * silently caches nothing. Both are worse than not starting.
 */

const config = loadConfig();

if (!config.serviceToken) {
  console.error('SPEECH_SERVICE_TOKEN is required. The service will not start without one.');
  process.exit(1);
}
if (!config.databaseUrl) {
  console.error('SPEECH_DATABASE_URL (or DATABASE_URL) is required.');
  process.exit(1);
}

const ran = await migrate(config.databaseUrl, config.schema);
console.log(
  ran.length
    ? `Speech: applied ${ran.length} migration(s): ${ran.join(', ')}`
    : 'Speech: migrations none pending',
);

const store = new PostgresAudioStore(config.databaseUrl, config.schema);
const app = buildServer({ config, store, logger: true });

const shutdown = async () => {
  await app.close();
  await store.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port: config.port, host: config.host });
app.log.info(
  { provider: config.tts.provider, schema: config.schema },
  'Speech service ready',
);
