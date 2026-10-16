---
title: Use Database Migrations
impact: HIGH
impactDescription: Enables safe, repeatable database schema changes
tags: database, migrations, schema
---

## Use Database Migrations

Never apply schema changes by hand. Use migrations for all schema changes. Migrations provide version control for your database, enable safe rollbacks, and ensure consistency across all environments. The connection and the migrations both live in `infra/database/` — configured once from typed config, never in a feature module or the composition root.

The examples below use TypeORM. If your project uses Mongoose (see `db-avoid-n-plus-one` and the data rules in `nestjs-graphql-structure`), apply the same principle with its migration tooling — for example `migrate-mongo` — keeping the migrations under `infra/database/migrations/`.

**Incorrect (manual schema changes, no home for migrations):**

```typescript
// Manual SQL in production
@Injectable()
export class DatabaseService {
  async addField(): Promise<void> {
    await this.dataSource.query('ALTER TABLE users ADD COLUMN age INT');
    // No version control, no rollback, inconsistent across envs
  }
}

// Feature module owns the connection
// modules/users/users.module.ts
@Module({ imports: [MongooseModule.forRoot(process.env.MONGO_URI)] })
export class UsersModule {}

// migrations/0001-init.ts dumped at the repository root
```

**Correct (one infrastructure module; migrations under infra/database/):**

```typescript
// infra/database/data-source.ts — used by the migration CLI
export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/infra/database/migrations/*.js'],
  synchronize: false, // Always false outside local development
  migrationsRun: true, // Run migrations on startup
});

// infra/database/database.module.ts — the connection is configured once
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        synchronize: false, // Only enabled locally, never in production
        migrations: ['dist/infra/database/migrations/*.js'],
        migrationsRun: true,
        autoLoadEntities: true,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

// a feature registers only the entities it owns
@Module({ imports: [TypeOrmModule.forFeature([User])] })
export class UsersModule {}

// infra/database/migrations/1705312800000-AddUserAge.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAge1705312800000 implements MigrationInterface {
  name = 'AddUserAge1705312800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column with default to handle existing rows
    await queryRunner.query(`
      ALTER TABLE "users" ADD "age" integer DEFAULT 0
    `);

    // Add index for frequently queried columns
    await queryRunner.query(`
      CREATE INDEX "IDX_users_age" ON "users" ("age")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Always implement down for rollback
    await queryRunner.query(`DROP INDEX "IDX_users_age"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "age"`);
  }
}

// Safe column rename (two-step)
export class RenameNameToFullName1705312900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add new column
    await queryRunner.query(`
      ALTER TABLE "users" ADD "full_name" varchar(255)
    `);

    // Step 2: Copy data
    await queryRunner.query(`
      UPDATE "users" SET "full_name" = "name"
    `);

    // Step 3: Add NOT NULL constraint
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL
    `);

    // Step 4: Drop old column (after verifying app works)
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "name" varchar(255)`);
    await queryRunner.query(`UPDATE "users" SET "name" = "full_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "full_name"`);
  }
}
```

Reference: [TypeORM Migrations](https://typeorm.io/migrations)
