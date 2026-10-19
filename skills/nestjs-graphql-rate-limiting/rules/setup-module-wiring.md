---
title: Wire the Throttler Once, with Named Windows
impact: CRITICAL
impactDescription: one global guard and one config, not per-resolver wiring that drifts
tags: throttler, setup, module, config
---

## Wire the Throttler Once, with Named Windows

**Impact: CRITICAL (one global guard and one config, not per-resolver wiring that drifts)**

Register `ThrottlerModule` **once** — in the composition root or in `infra/` — declare a small set of
**named windows** (`short`, `medium`, `long`), and apply the guard **globally** with `APP_GUARD`. A
feature then expresses policy by *name* (`@RateLimit({ window: 'medium' })`) instead of inventing its
own numbers, so limits are one reviewable table rather than scattered magic constants.

`ttl` is **milliseconds** in throttler v5+; `seconds(...)` and `minutes(...)` keep the config readable
and prevent the classic 1000× error.

**Incorrect (each resolver picks its own guard and its own numbers):**

```typescript
// modules/auth/resolvers/auth.mutation.resolver.ts
@Resolver(() => Auth)
@UseGuards(ThrottlerGuard)                 // per-resolver wiring — easy to forget on a new resolver
export class AuthMutationResolver {
  @Mutation(() => TokenResponse)
  @Throttle({ default: { limit: 5, ttl: 60000 } })   // a bare number that means something only here
  login() {}
}
// and again, differently, in every other resolver
```

Why it is wrong: the guard is opt-in, so a resolver added later silently has no limit; the numbers
exist only at call sites; and nothing enforces the same window in two places.

**Correct (one module, named windows, one global guard):**

```typescript
// infra/rate-limit/rate-limit.module.ts
import { ThrottlerModule } from '@nestjs/throttler';
import { seconds, minutes } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'short',  ttl: seconds(1),  limit: config.get('rateLimit.short') },
          { name: 'medium', ttl: seconds(10), limit: config.get('rateLimit.medium') },
          { name: 'long',   ttl: minutes(1),  limit: config.get('rateLimit.long') },
        ],
        storage: buildThrottlerStorage(config),   // shared store — see `setup-storage`
      }),
    }),
  ],
})
export class RateLimitModule {}

// app.module.ts — the one global registration
@Module({
  providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }],  // see `setup-graphql-guard`
  imports: [RateLimitModule],
})
export class AppModule {}

// a resolver only names a window; it never re-invents limits
@Mutation(() => TokenResponse)
@RateLimit({ window: 'long' })
login(@Args('input') input: LoginInput) {}
```

Why it is right: the guard is global (nothing is unprotected by accident), every window is defined
once and named, and a resolver's policy is a one-line, greppable reference to that table.

The config arrives through a typed namespace, never `process.env` at the call site — see
`devops-use-config-module` in the `nestjs-best-practices` skill and `infra-config` in
`nestjs-graphql-structure`.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [nestjs/throttler](https://github.com/nestjs/throttler)
