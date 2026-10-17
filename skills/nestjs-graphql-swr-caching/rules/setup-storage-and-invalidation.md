---
title: Enable Invalidation and Set referencesTTL and GC
impact: CRITICAL
impactDescription: tag invalidation is OFF by default and silently misses without this
tags: redis, invalidation, referencesTTL, gc, storage
---

## Enable Invalidation and Set referencesTTL and GC

**Impact: CRITICAL (tag invalidation is OFF by default and silently misses without this)**

Explicit invalidation is **disabled by default** in the storage options. Enable it, set
`referencesTTL` to at least the longest hard expiry (`ttl + swr`), and schedule garbage collection.
Skip any of the three and tag purges become no-ops or leak references forever.

- **memory** storage is per-process and size-capped (default 1024 *per definition*); it has **no GC**.
  Use it only for single-process, non-shared data.
- **redis** storage is required for a shared cache, and references must be garbage-collected
  (`lazy` frequently, `strict` occasionally).

**Incorrect (invalidation left off; references TTL shorter than entries):**

```typescript
storage: { type: 'redis', options: { client: redis } } // invalidation NOT enabled -> tags do nothing
```

Why it is wrong: `@InvalidateTags` runs but purges nothing, and stale entries live until their TTL.

**Correct (enable invalidation, outlive entries, collect garbage):**

```typescript
const hardSeconds = ttl + swr; // ttl = fresh, swr = stale window

const client = createCache({
  ttl,
  stale: swr,
  storage: {
    type: 'redis',
    options: {
      client: redis,
      invalidation: { referencesTTL: hardSeconds }, // >= longest hard expiry, or refs expire first
    },
  },
});

// infra/cache/cache.gc.ts — keep references from accumulating
const storage = createStorage('redis', { client: redis, invalidation: true });

// lazy: chunked. Carry the cursor the report returns, or you rescan the same first chunk forever.
let cursor: unknown;
setInterval(async () => {
  const report = await storage.gc('lazy', { lazy: { cursor } });
  if (report.error) return;                 // log it; never throw out of a timer
  cursor = report.cursor;
}, 60_000).unref();

setInterval(() => storage.gc('strict', { chunk: 250 }), 10 * 60_000).unref();
```

```typescript
// infra/cache/cache.module.ts — close the Redis connection on shutdown
// CACHE_REDIS is declared once, in infra/cache/cache.tokens.ts
export class CacheModule implements OnApplicationShutdown {
  constructor(@Inject(CACHE_REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown() { await this.redis.quit().catch(() => {}); }
}
```

Why it is right: invalidation actually fires, references live at least as long as the entries they
guard, and expired references are pruned instead of slowing every write.

Reference: [async-cache-dedupe invalidation + gc](https://github.com/mcollina/async-cache-dedupe)
