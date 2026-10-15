---
title: Put Typed Configuration in config/
impact: MEDIUM
impactDescription: no process.env scattered through the app
tags: config, env, validation
---

## Put Typed Configuration in config/

**Impact: MEDIUM (no process.env scattered through the app)**

**Purpose.** Configuration lives in `config/` as typed namespaces plus a validation schema.
Modules inject `ConfigService` (or a namespaced config type) instead of reading `process.env`
directly, and validation runs at startup so a missing variable fails fast rather than in
production under load.

**Placement.** `src/config/app.config.ts`, `src/config/database.config.ts`,
`src/config/validation.schema.ts`.

**Responsibilities.**

- Define typed namespaces with `registerAs`.
- Validate required environment variables at startup (Joi or Zod).
- Load once and expose globally.

**Never.**

- Read `process.env` inside services or resolvers.
- Hardcode secrets or defaults at the point of use.
- Parse numbers or booleans ad hoc at each call site.

**Incorrect (scattered, unvalidated environment access):**

```typescript
@Injectable()
export class PaymentsService {
  charge() {
    const key = process.env.STRIPE_KEY;                     // untyped, unvalidated
    const retries = parseInt(process.env.RETRIES ?? '3');   // parsed at every call site
    // ...
  }
}
```

Why it is wrong: configuration has no single source of truth, typos fail silently at runtime,
and a missing variable is discovered only when that code path runs.

**Correct (typed namespaces, validated once, injected):**

```typescript
// config/app.config.ts
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  stripeKey: process.env.STRIPE_KEY,
}));

// config/validation.schema.ts
export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  STRIPE_KEY: Joi.string().required(),
});

// app.module.ts
ConfigModule.forRoot({ isGlobal: true, load: [appConfig], validationSchema });

// services/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(private readonly config: ConfigService) {}

  charge() {
    const key = this.config.get<string>('app.stripeKey'); // typed, validated at startup
  }
}
```

Why it is right: one typed source of truth, validated once at boot, injected where needed.

Reference: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)
