---
title: Give a Hot Field Its Own Budget
impact: MEDIUM
impactDescription: one abusable field should not consume the caller's whole allowance
tags: field, budget, hot-field, isolation
---

## Give a Hot Field Its Own Budget

**Impact: MEDIUM (one abusable field should not consume the caller's whole allowance)**

Some fields are in a different cost class from everything around them — a full-text search, a report
generator, an export, a geospatial query. Bundling them into the global window creates a lose-lose: a
client that legitimately hammers cheap fields is blocked by one expensive call, and a client that
abuses the one hot field still consumes only `1` of the global budget. Give the hot field a **dedicated
window**, or a tracker key that includes the field coordinate, so its consumption is isolated.

**Incorrect (the hot field shares the global window):**

```typescript
@Query(() => [Result])
search() {}          // priced high for the ceiling, but the *rate* is the global window
```

Why it is wrong: the ceiling only rejects a single over-large query — a client can still run 100
medium-cost searches per minute inside the global allowance, starving every other query of its budget.

**Correct (a dedicated window for the hot field, declared in the config table):**

```typescript
// infra/rate-limit/rate-limit.module.ts — a named window for the expensive surface
throttlers: [
  { name: 'short',  ttl: seconds(1),  limit: config.get('rateLimit.short') },
  { name: 'long',   ttl: minutes(1),  limit: config.get('rateLimit.long') },
  { name: 'search', ttl: minutes(1),  limit: config.get('rateLimit.search') },  // its own budget
];
```

```typescript
// the hot field names its own window; every other field keeps the global one
@Query(() => [Result])
@RateLimit({ window: 'search' })
search(@Args() args: SearchArgs) { /* ... */ }
```

Why it is right: search abuse drains the search budget, not the client's entire allowance, and cheap
queries are unaffected by how much search a client runs.

Rules of thumb:

- **Isolate by *purpose*, not by preference.** Create a dedicated window only where the cost class is
  genuinely different; one window per field is just a config nobody can reason about.
- **The budget layer already keys by tracker** — if you prefer one window, include the field coordinate
  in the tracker key instead (`identity-tracker-hierarchy`), so `search` and `items` have separate
  counters within one window.
- **Pair the budget with a cost multiplier** (`field-list-multipliers`): the window bounds how *often*,
  the multiplier bounds how *much* each call, and the two together bound the total load.
- **The dedicated window is still a configuration value, never a literal on the decorator** — see
  `decorator-typed-options`.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [GraphQL performance](https://graphql.org/learn/performance/)
