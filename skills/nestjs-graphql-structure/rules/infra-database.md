---
title: Put Database Setup and Migrations in infra/database/
impact: MEDIUM
impactDescription: the connection is configured once
tags: database, migrations, mongodb
---

## Put Database Setup and Migrations in infra/database/

**Impact: MEDIUM (the connection is configured once)**

**Purpose.** The database connection and migrations live in `infra/database/`. The module
configures the connection from typed config; migrations live in a subfolder; feature modules
declare only their own collections/entities via `forFeature`.

**Placement.** `src/infra/database/database.module.ts`, `database.providers.ts`, `migrations/`.

**Responsibilities.**

- Configure the connection from `ConfigService` (once).
- Export the connection module for features to import.
- Hold migration files.

**Never.**

- Configure the database in a feature module.
- Dump migrations at the repository root.
- Read database environment variables directly — use `config/`.

**Incorrect (a feature configures the whole database):**

```typescript
// modules/users/users.module.ts
@Module({ imports: [MongooseModule.forRoot(process.env.MONGO_URI)] })
export class UsersModule {}

// migrations/0001-init.ts at the repository root, beside unrelated folders
```

Why it is wrong: an arbitrary feature owns the connection, and migrations have no home.

**Correct (one infrastructure module, features register only their own schema):**

```typescript
// infra/database/database.module.ts
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('database.uri') }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}

// a feature declares only its own collection
@Module({ imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])] })
export class UsersModule {}
```

Why it is right: the connection is configured once from typed config, and each feature registers
only the collections it owns.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)
