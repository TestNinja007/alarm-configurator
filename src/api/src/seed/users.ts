/**
 * The two seeded accounts. Their ids are fixed so tests can reference them
 * directly; the full folder and alarm fixtures arrive with the seed profiles
 * in stage 3 (docs/seed.md).
 */
export const SEED_USERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    externalKey: 'user-one',
    email: 'user-one@example.com',
    name: 'Ada Mercer',
    password: 'Password123!',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    externalKey: 'user-two',
    email: 'user-two@example.com',
    name: 'Bo Ferreira',
    password: 'Password123!',
  },
] as const;

export type SeedUser = (typeof SEED_USERS)[number];
