import { pool } from '../db/pool.js';
import { seed, type SeedProfile } from './index.js';

const requested = (process.argv[2] ?? 'demo') as SeedProfile;

if (requested !== 'demo' && requested !== 'empty') {
  console.error(`Unknown seed profile "${requested}". Use "demo" or "empty".`);
  process.exit(1);
}

seed(requested)
  .then(() => {
    console.log(`Seeded the "${requested}" profile.`);
    return pool.end();
  })
  .catch((error: unknown) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
    return pool.end();
  });
