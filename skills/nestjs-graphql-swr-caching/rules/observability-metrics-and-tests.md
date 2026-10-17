---
title: Track the Metrics That Prove the Fix, and Test on Outcomes
impact: MEDIUM
impactDescription: you cannot claim the stampede is gone without these numbers
tags: metrics, testing, hit-ratio, stale
---

## Track the Metrics That Prove the Fix, and Test on Outcomes

**Impact: MEDIUM (you cannot claim the stampede is gone without these numbers)**

Track: `hits`, `misses`, `dedupes` (`onDedupe`), `bypasses`, `errors`, `evictions`, `hit_ratio`.
Watch **dedupes** — a consistently high count means many callers were asking for the same key at the
same time, so single-flight is doing its job under load (or keys are too coarse). It is **not** a
TTL signal: the engine never tells you that a value was served while revalidating, so there is no
"stale ratio" to watch unless you wrap the client yourself (see `observability-limits-of-events`).

Provide test helpers backed by an in-memory store, and assert on the **outcome**, never on Redis
internals.

**Incorrect (asserting on Redis, no metrics):**

```typescript
expect(await redis.exists('cache:TitlesService.getTitle:42')).toBe(1); // brittle, implementation-bound
```

Why it is wrong: the test breaks on any key-shape or driver change and proves nothing about behaviour
under expiry.

**Correct (assert behaviour; instrument counters):**

```typescript
const fake = createCache({ ttl: 60, stale: 300, storage: { type: 'memory' }, onHit, onMiss, onDedupe });

// second call within ttl -> served from cache, loader not called again
expect(onMiss).toHaveBeenCalledTimes(1);
expect(onHit).toHaveBeenCalledTimes(1);

// past ttl, within ttl+swr -> value served AND one revalidation, from three concurrent callers
jest.advanceTimersByTime(61_000);
const [r1, r2, r3] = await Promise.all([getTitle('42'), getTitle('42'), getTitle('42')]);
expect(loader).toHaveBeenCalledTimes(2);          // initial + one refresh
expect(onDedupe).toHaveBeenCalledTimes(2);        // 3 concurrent callers -> 2 collapsed into the 1 load
```

Why it is right: the test asserts the observable contract — freshness window, one deduped refresh,
hit/miss counting — independent of the storage implementation.

Also verify: an anonymous `perUser` read bypasses, a failed loader caches nothing, and invalidation
makes the next read fresh.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
