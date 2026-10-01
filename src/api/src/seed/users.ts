/**
 * The seeded accounts. Their ids are fixed so tests can reference them
 * directly; every record they own is documented in docs/seed.md.
 */
/**
 * Roles and tiers are set alongside each account. The two ordinary users sit on
 * different tiers deliberately: user one is advanced so every feature is
 * reachable from the demonstration data, and user two is basic so the limits
 * are reachable too, without anyone having to downgrade an account first.
 */
export const SEED_USER_ROLES: Record<string, { role: 'user' | 'admin'; tier: 'basic' | 'regular' | 'advanced' }> = {
  'user-one': { role: 'user', tier: 'advanced' },
  'user-two': { role: 'user', tier: 'basic' },
  'admin-user': { role: 'admin', tier: 'advanced' },
};

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
  {
    id: '33333333-3333-4333-8333-999999999999',
    externalKey: 'admin-user',
    email: 'admin@example.com',
    name: 'Ira Okonkwo',
    password: 'Password123!',
  },
] as const;

export type SeedUser = (typeof SEED_USERS)[number];
