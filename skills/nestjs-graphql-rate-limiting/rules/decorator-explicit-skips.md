---
title: Make Every Skip Explicit and Greppable
impact: CRITICAL
impactDescription: an implicit skip is an unthrottled endpoint nobody knows about
tags: decorators, skip, review, exemptions
---

## Make Every Skip Explicit and Greppable

**Impact: CRITICAL (an implicit skip is an unthrottled endpoint nobody knows about)**

A rate limiter fails open in one dangerous direction: a field that is *meant* to be limited but is
silently not. The two causes are a missing guard binding and an implicit skip (`skipIf` predicates,
early returns, a guard that swallows errors). Make every exemption an explicit decorator that carries a
reason, so `grep -r SkipRateLimit` enumerates the entire unthrottled surface in review.

**Incorrect (skips hidden in predicates and control flow):**

```typescript
ThrottlerModule.forRoot({
  // an admin bypass nobody can find later
  skipIf: (context) => GqlExecutionContext.create(context).getContext().req.user?.isAdmin,
});

@Query(() => [Item])
async items(): Promise<Item[]> {
  if (this.config.get('disableLimits')) return this.itemsService.findAll();  // an invisible skip
  return this.itemsService.findAll();
}
```

Why it is wrong: the unthrottled paths are scattered across configuration and method bodies, so no code
search lists them and no reviewer can see the whole exposure.

**Correct (one explicit, reason-carrying decorator — and it does not disable the document ceiling):**

```typescript
// common/decorators/rate-limit.decorators.ts
export const SkipRateLimit = (reason: string) =>
  applyDecorators(SetMetadata('skipRateLimit', reason), SkipThrottle());
```

```typescript
// every exemption is one line, with a reason, in the resolver that owns it
@Query(() => String)
@SkipRateLimit('health probe — must never be throttled')
health() { return 'ok'; }

@Subscription(() => Order)
@SkipRateLimit('subscriptions are limited per-connection, not per-request')
orderCreated() { /* ... */ }
```

```bash
# review the entire unthrottled surface at a glance
grep -rn "SkipRateLimit(" src/
```

Why it is right: the exemptions are enumerated in one search, each carries its justification, and the
admin case is handled by the tracker hierarchy (`identity-tracker-hierarchy`) rather than a hidden
bypass.

Rules of thumb:

- **One global `skipIf` is legitimate; per-request identity predicates are not.** A single module-level
  `skipIf: () => !config.get('rateLimit.enabled')` is the documented kill switch
  (`setup-kill-switch`); a `skipIf` that reads `req.user.isAdmin` is exactly the hidden exemption this
  rule forbids.
- **A skip disables the counters, never the depth/cost ceiling.** `SkipThrottle()` leaves the
  validation rules alone, which is correct — an exempt endpoint can still not run a denial-of-service
  document (`depth-validation-rule`).
- **Prefer a higher window over a skip.** If an endpoint needs *more* room, give it its own window
  (`field-hot-field-budget`); a skip should be rare and argued.
- **Never swallow the store error into a skip.** An unavailable store fails open for everyone by design
  (`setup-fail-open`); it is not an endpoint-specific exemption.
- **Count them in CI.** A lint or a simple test that asserts the `@SkipRateLimit` list has not grown
  unexpectedly turns the review practice into an automated one.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [nestjs/throttler](https://github.com/nestjs/throttler)
