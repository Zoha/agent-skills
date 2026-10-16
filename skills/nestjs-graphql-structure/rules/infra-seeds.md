---
title: Put Seed Scripts in infra/database/seeds/
impact: MEDIUM
impactDescription: repeatable seed data has one home and one entry point
tags: seeds, fixtures, database, infra
---

## Put Seed Scripts in infra/database/seeds/

**Impact: MEDIUM (repeatable seed data has one home and one entry point)**

**Purpose.** Seed data — the baseline rows a fresh environment needs for local development,
demos, or tests — is a runnable concern, not application code. Seed scripts live beside migrations
in `infra/database/seeds/`, are idempotent, and are run through a single documented entry point.
They are never triggered from the request path or from a feature module's lifecycle.

**Placement.** `src/infra/database/seeds/<name>.seed.ts`, with a runner such as
`seeds/run-seeds.ts` (or an npm script) as the one entry point.

**Responsibilities.**

- Keep each seed script focused and idempotent (safe to run twice).
- Read connection details from `config/`, not hardcoded.
- Provide one documented way to run all seeds.

**Never.**

- Seed from a feature module or a resolver.
- Ship non-idempotent seeds that duplicate rows on every run.
- Hardcode credentials in a seed script.

**Incorrect (seed data created in application code on every startup):**

```typescript
// modules/users/users.module.ts
async onModuleInit() {
  await this.usersRepository.create({ email: 'admin@example.com' }); // runs on every boot
}
```

Why it is wrong: seeding happens in application code on every start, duplicates rows, and cannot
be run or skipped deliberately.

**Correct (one idempotent seed script behind a runner):**

```typescript
// infra/database/seeds/admin-user.seed.ts
export async function seedAdminUser(users: UsersRepository): Promise<void> {
  const existing = await users.findByEmail('admin@example.com');
  if (existing) return; // idempotent
  await users.create({ email: 'admin@example.com', roles: ['admin'] });
}

// infra/database/seeds/run-seeds.ts — the single entry point
// `npm run seed` runs every seed script once, against the configured database
```

Why it is right: seed data has one home, is idempotent, and runs only when asked.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [migrate-mongo](https://github.com/seppevs/migrate-mongo)
