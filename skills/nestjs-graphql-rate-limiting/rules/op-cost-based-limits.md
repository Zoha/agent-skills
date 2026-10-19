---
title: Price by Cost, Not by Call Count Alone
impact: CRITICAL
impactDescription: a count limit prices a cheap query and a monster identically
tags: cost, complexity, budget, credits
---

## Price by Cost, Not by Call Count Alone

**Impact: CRITICAL (a count limit prices a cheap query and a monster identically)**

A request count treats `{ me { id } }` and `{ search(first: 500) { edges { node { ...50 fields } } } }`
as one unit each. They are not. The real unit is **cost**. Keep two mechanisms:

- a **ceiling** — reject any single document whose cost exceeds `maxCost` (the validation rule, see
  `depth-validation-rule`);
- a **budget** — charge each accepted operation its cost against a per-tracker window, so many cheap
  queries or a few expensive ones both run out of the same allowance.

Cost is computed *before* resolvers run (validation), so the guard/interceptor can read it and charge
the budget.

**Incorrect (a pure count, so one monster query is "1 request"):**

```typescript
// 60 operations/minute — but one operation can cost 500 units
ThrottlerModule.forRoot([{ name: 'long', ttl: 60_000, limit: 60 }]);
```

Why it is wrong: an attacker fits one maximum-complexity query per second, stays under the count, and
spends a thousand times a normal client's resources.

**Correct (a cost ceiling plus a cost budget):**

```typescript
// infra/graphql/graphql.module.ts — the ceiling, computed during validation
import { createComplexityRule, simpleEstimator, fieldExtensionsEstimator } from 'graphql-query-complexity';

validationRules: [
  createComplexityRule({
    maximumComplexity: 1000,
    estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
    // onComplete receives a MAP of operation name -> cost, not a single number.
    onComplete: (complexities: Record<string, number>) => {
      currentCost.set(Math.max(...Object.values(complexities)));
    },
  }),
];
```

```typescript
// infra/rate-limit/budget.ts — charge cost against the window, not a flat 1
async function chargeBudget(tracker: string, cost: number): Promise<ChargeResult> {
  const key = `budget:${tracker}:long`;
  // ThrottlerStorage.increment counts by ONE (key, ttl, limit, blockDuration, name),
  // so a cost budget needs your own atomic increment-by-N over the same store:
  const total = await redis.incrby(key, cost);          // atomic; 500-cost query spends 500
  if (total === cost) await redis.pexpire(key, COST_TTL_MS);
  return { isBlocked: total > COST_BUDGET };
}
```

Why it is right: cheap reads stay cheap, an expensive query is priced like the work it does, and a
burst of either can no longer hide behind a request counter.

Practical notes:

- **The ceiling and the budget use the same estimator chain** (`field-cost-weights`,
  `field-list-multipliers`), so the number you reject on and the number you charge are the same
  number — two different cost models are a bug waiting to happen.
- `ThrottlerStorage.increment(key, ttl, limit, blockDuration, name)` **counts by one** — it takes no
  "hits" argument. A cost budget needs either your own `INCRBY`-style primitive over the same store
  (as above), or a credit bucket that decrements by `cost`.
- **Default cost per field is 1**, and a scalar is genuinely cheap; the estimator chain is where you
  say a list, a search, or an aggregate costs more.

Reference: [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) | [GraphQL performance](https://graphql.org/learn/performance/)
