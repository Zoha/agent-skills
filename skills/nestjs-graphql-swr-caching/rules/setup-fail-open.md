---
title: Fail Open, and Never Cache Errors
impact: CRITICAL
impactDescription: a cache/Redis outage must degrade to slow, not to 500
tags: fail-open, errors, resilience, redis
---

## Fail Open, and Never Cache Errors

**Impact: CRITICAL (a cache/Redis outage must degrade to slow, not to 500)**

A cache is an optimization; it must never take the request down. Wrap the **read**, the **write**, and
**serialization** in try/catch, treat any failure as a miss, and fall through to the source. The
engine's `onError` hook must emit an event and return — never throw. And an error result must never be
cached.

**Incorrect (cache errors propagate; errors get cached):**

```typescript
const cached = await client.get(key);            // throws on Redis blip -> request fails
if (cached) return cached;
const data = await load();
await client.set(key, data);                     // if data is an error object, it is now cached
```

Why it is wrong: a Redis hiccup becomes a user-facing 500, and a cached error is served until the TTL.

**Correct (fail-open wrapper; only successful results are stored):**

```typescript
function recordEvent(outcome: CacheOutcome, extra?: Partial<CacheEvent>) {
  return (...args: unknown[]) => pushCacheEvent({ outcome, ...extra }); // never throws
}

const client = createCache({
  ttl, stale: swr,
  storage,
  onError: recordEvent('error'),   // emit and continue
});

async function readThrough<T>(name: string, arg: unknown, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await (client as any)[name](arg);
    return hit;
  } catch {
    return load();                 // any cache failure -> go to source
  }
}

// only a resolved, non-error result is cached; a throw leaves the cache untouched
async function load(): Promise<Data> {
  const data = await repo.find();
  if (!data) throw new NotFoundException();      // never store this
  return data;
}
```

Why it is right: every cache interaction degrades to the source on failure, and a rejected loader
never populates an entry.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe) | [NestJS Exception filters](https://docs.nestjs.com/exception-filters)
