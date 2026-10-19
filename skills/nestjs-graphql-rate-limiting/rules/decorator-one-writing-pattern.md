---
title: One Declarative Surface for Policy
impact: CRITICAL
impactDescription: one greppable shape beats per-resolver wiring that drifts
tags: decorators, pattern, metadata, guard
---

## One Declarative Surface for Policy

**Impact: CRITICAL (one greppable shape beats per-resolver wiring that drifts)**

Exactly **one** way to express each rate-limiting decision:

| Decision | Decorator |
|---|---|
| Which window applies (optionally override the limit) | `@RateLimit({ window, limit? })` |
| Charge this field a higher cost | `@RateLimitCost(n)` |
| Exempt this resolver, deliberately | `@SkipRateLimit(reason)` |

Everything else — the guard, the storage, the window table — is wired once (`setup-module-wiring`). A
feature never `@UseGuards(ThrottlerGuard)` directly, never inlines a number, and never reaches into the
storage.

**Incorrect (three ways to say the same thing, numbers at call sites):**

```typescript
@Resolver(() => Auth)
@UseGuards(ThrottlerGuard)                              // wiring done per-resolver
export class AuthMutationResolver {
  @Mutation(() => TokenResponse)
  @Throttle({ default: { limit: 5, ttl: 60000 } })      // a literal, defined here and nowhere else
  login() {}

  @Mutation(() => Boolean)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })    // a different literal, same window
  forgotPassword() {}
}
```

Why it is wrong: policy is spread across resolvers as raw numbers, the guard binding is opt-in (forget
it and the resolver is unprotected), and no two limits are comparable in review.

**Correct (three small decorators over the throttler's metadata):**

```typescript
// common/decorators/rate-limit.decorators.ts
import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

export const RATE_LIMIT_COST = 'rateLimitCost';

/**
 * Select a named window from the config table; `limit` overrides only that window.
 * With no `limit`, pass NO Throttle override at all: `Throttle({ win: {} })` is a
 * partial override whose limit/ttl are undefined, so it can behave as a no-op.
 */
export function RateLimit(opts: { window: RateLimitWindow; limit?: number }) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_WINDOW, opts.window),          // for the cost layer + review
    ...(opts.limit !== undefined
      ? [Throttle({ [opts.window]: { limit: opts.limit } })]
      : []),
  );
}

/** Price this field for the cost model (read by the estimator chain). */
export const RateLimitCost = (cost: number) => SetMetadata(RATE_LIMIT_COST, cost);

/** Deliberate exemption; the `reason` is mandatory and greppable. */
export const SkipRateLimit = (reason: string) =>
  applyDecorators(SetMetadata('skipRateLimit', reason), SkipThrottle());
```

```typescript
// a resolver uses the surface, never the primitives
@Mutation(() => TokenResponse)
@RateLimit({ window: 'long' })
login(@Args('input') input: LoginInput) {}

@Query(() => [Result])
@RateLimit({ window: 'search' })
@RateLimitCost(25)
search(@Args() args: SearchArgs) {}

@Query(() => String)
@SkipRateLimit('health probe — must never be throttled')
health() { return 'ok'; }
```

Why it is right: every policy decision is one greppable line, numbers live in the config table (or the
cost model), and the guard is bound once globally so nothing is unprotected by accident.

Notes:

- **`@RateLimit` should default, not repeat.** With no `limit`, it asserts "the global window applies"
  and the field is still limited; passing `limit` is the visible, reviewable override.
- **`@SkipRateLimit` must carry a reason.** The reason is what makes a skip reviewable; a bare skip is
  an unthrottled endpoint nobody notices (see `decorator-explicit-skips`).
- **Windows are a closed set.** Type `RateLimitWindow` as a union of the configured names so a typo is a
  compile error rather than a silent no-op (`decorator-typed-options`).
- **Group them in one file** under `common/decorators/` so the whole surface is readable at once, which
  also satisfies the placement rule (`setup-file-placement`, `infra-common`).

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [nestjs/throttler](https://github.com/nestjs/throttler)
