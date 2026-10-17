---
title: Keep a .env.example in Sync with Configuration
impact: LOW-MEDIUM
impactDescription: New environments boot without guesswork
tags: devops, configuration, environment, documentation
---

## Keep a .env.example in Sync with Configuration

Every real env file is gitignored, so a committed `.env.example` is the only record of what the
application reads. Treat it as part of the configuration surface: whenever you add, rename, or
remove a variable in a `config/` namespace or the validation schema, update `.env.example` in the
same change. This is what lets a new developer or a new deployment know which variables to set
before the app boots — startup validation (see `devops-use-config-module`) then tells them which
values are still missing.

**Incorrect (variable added to the schema but not to the example):**

```typescript
// config/validation.schema.ts — STRIPE_KEY is now required at startup
export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  STRIPE_KEY: Joi.string().required(), // added here...
  JWT_SECRET: Joi.string().min(32).required(),
});

// .env.example — ...but never added here
// PORT=3000
// JWT_SECRET=replace-me

// Result: a fresh clone boots, fails on STRIPE_KEY, and no file says the variable exists.
```

```bash
# .env.example committed WITH real values — the secrets leak into the repository
JWT_SECRET=super-secret-production-key
DB_PASSWORD=prod-db-password
```

Why it is wrong: the example drifts from the schema the moment a variable is added, so the only
description of the configuration surface is out of date, and any real secret placed in it is
committed to history.

**Correct (one place lists every variable; changes land together):**

```bash
# .env.example — committed; placeholders only, grouped by namespace, never a real secret
# --- app ---
NODE_ENV=development
PORT=3000
API_PREFIX=api

# --- database ---
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your-user
DB_PASSWORD=your-password
DB_NAME=your-database

# --- auth ---
# Min 32 chars, generate with: openssl rand -hex 32
JWT_SECRET=your-jwt-secret
```

```typescript
// config/app.config.ts — same namespace, same variables as the example
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  environment: process.env.NODE_ENV ?? 'development',
  apiPrefix: process.env.API_PREFIX ?? 'api',
}));

// config/validation.schema.ts — every variable the example lists is validated here
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
});
```

Rules of thumb:

- Adding a configurable variable is a **three-place change**: its namespace in `config/`, its entry
  in `validation.schema.ts`, and its line in `.env.example`. Miss the third and the surface is
  undocumented; miss the second and it is unvalidated.
- `.env.example` is documentation, never loaded at runtime — it is not read by `envFilePath`.
- Use placeholder values (`your-password`, `replace-me`), never real credentials. Commit it; keep
  the real `.env*` files gitignored.
- Remove a variable's line when the variable is removed, so the example does not accumulate settings
  nobody reads.
- Keep both `.env.example` and `.env.test.example` (or a documented `NODE_ENV=test` section) when
  e2e tests use their own env file (see `test-e2e-supertest`).

Reference: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration) | [The Twelve-Factor App — Config](https://12factor.net/config)

**Behavioral depth.** See `devops-use-config-module` for the validated-namespace pattern this rule documents.
