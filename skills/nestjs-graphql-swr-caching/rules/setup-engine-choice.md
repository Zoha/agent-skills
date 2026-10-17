---
title: Use a Deduplicating Engine, and Count TTL in Seconds
impact: CRITICAL
impactDescription: SWR without reimplementing single-flight, and no 1000x TTL bug
tags: async-cache-dedupe, single-flight, swr, ttl, units
---

## Use a Deduplicating Engine, and Count TTL in Seconds

**Impact: CRITICAL (SWR without reimplementing single-flight, and no 1000x TTL bug)**

Back the client with a deduplicating engine — `async-cache-dedupe` is the transport-agnostic default
(`mercurius-cache` is the same engine at the field level). Do not hand-roll the cache envelope unless
you actually need outcomes the engine cannot report (see `observability-limits-of-events`). The engine
gives you, for free: a real `stale` window, **single-flight dedupe**, `references`-based invalidation,
and stable-stringify keys.

Two unit facts that are the single most common implementation bug:

- **`async-cache-dedupe` takes `ttl`/`stale` in SECONDS.**
- `@nestjs/cache-manager`/Keyv and HTTP `Cache-Control` take **milliseconds**.

And one default that silently disables caching: **`ttl` defaults to `0`**, which the engine documents
as *"the function will be only the deduped"* — nothing is stored and every call reaches the source. So
`@Cacheable({ swr: 300 })` with no `ttl` caches **nothing**. Always set `ttl` explicitly; an omitted
one is the same class of silent no-op as a renamed library option (see `driver-version-pinning`).

**Incorrect (hand-rolled envelope + millisecond TTLs):**

```typescript
await redis.set(key, JSON.stringify({ v, soft: now + 60_000, hard: now + 360_000 }));
// no single-flight -> N concurrent misses do N loads; and units are easy to mix
```

Why it is wrong: you reimplement dedupe, stale serving, and invalidation (each a bug surface), and a
seconds/ms mix is a silent 1000x error.

**Correct (engine owns the mechanism; you own the policy):**

```typescript
import { createCache } from 'async-cache-dedupe';

const client = createCache({
  ttl: 60,          // seconds
  stale: 300,       // seconds served after ttl, while revalidating (true SWR)
  storage: { type: 'redis', options: { client: redis, invalidation: true } },
});

// single-flight is built in: concurrent misses for one key -> one loader call
client.define('TitlesService.getTitle', { references: (args, key, result) => [`title:${result.id}`] },
  (id: string) => this.repo.findById(id));
```

Why it is right: SWR, dedupe, and references come from the engine; the units are the engine's
(seconds), and the policy (ttl/swr/tags) is all you write.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe) | [mercurius-cache](https://github.com/mercurius-js/cache)
