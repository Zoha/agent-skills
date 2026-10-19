---
title: Layer the Limits, and Never Charge Twice
impact: CRITICAL
impactDescription: overlapping counters compound and block legitimate traffic
tags: layers, edge, origin, defense-in-depth
---

## Layer the Limits, and Never Charge Twice

**Impact: CRITICAL (overlapping counters compound and block legitimate traffic)**

Demand control is a stack, and each layer must own a **distinct unit** so the limits compose instead
of compounding:

| Layer | Owns | Unit |
|---|---|---|
| Edge (Cloudflare) | crude flood protection | requests per IP / path / country |
| Origin — operation | how much work a caller may spend per window | operations or cost units per tracker |
| Origin — field | a single expensive field | field resolutions per tracker |
| Document guard | whether the document may run at all | depth / complexity (a ceiling, not a rate) |

**Incorrect (two layers measuring the same thing, so the effective limit halves):**

```typescript
// Cloudflare rule: 100 requests/minute per IP
// origin long window: 100 operations/minute per IP
// -> a legitimate client is blocked around 50/min, and nobody knows why
```

Also wrong, and worse:

```typescript
// the guard counts the request...
@UseGuards(GqlThrottlerGuard)
@Query(() => [Item])
async items(): Promise<Item[]> {
  await this.throttlerStorage.increment(/* the same key again */);  // ...and so does the handler
  return this.itemsService.findAll();
}
```

Why it is wrong: identical units at two layers compound to half the intended limit, and a handler that
also increments its own counter double-charges every call.

**Correct (distinct units, one owner each, and the ceiling kept on):**

```typescript
// 1. Edge: crude, per-IP flood only. Deliberately looser than the origin.
//    Cloudflare rule: 600 requests/minute per IP.

// 2. Origin — operation (once per request): the real budget.
OperationRateLimitMiddleware;   // 120 operations/minute per tracker — see `op-count-operations`

// 3. Origin — field (per resolver): only on the genuinely hot field.
@Query(() => [Item])
@RateLimit({ window: 'short' })   // `decorator-one-writing-pattern`
items() {}

// 4. Document ceiling (depth/cost): always on, independent of counters.
validationRules: [depthLimit(10), complexityLimit(1000)];
```

Why it is right: each layer has one job and one unit, so the numbers are meaningful and additive, and
the depth/cost ceiling stays on even when the counters are disabled (see `setup-kill-switch`).

Rules of thumb:

- **Keep the edge looser than the origin.** The edge is the blunt instrument; the origin is the
  precise one. If they are equal, the client sees the sum of two limits, not the tighter one.
- **One counter per concern.** The operation counter is incremented in exactly one place; the field
  guard is the only thing that increments the field counter. A service never touches the store.
- **Document the budget as a table.** A reviewer should be able to see all four layers and their units
  at once; three scattered magic numbers is how double-charging happens.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [GraphQL performance](https://graphql.org/learn/performance/)
