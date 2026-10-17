---
title: Use a Generation Prefix for Huge or Coarse Domains
impact: MEDIUM
impactDescription: O(1) invalidation instead of scanning thousands of keys
tags: generation, version, invalidation, catalog
---

## Use a Generation Prefix for Huge or Coarse Domains

**Impact: MEDIUM (O(1) invalidation instead of scanning thousands of keys)**

When a whole family of entries must be invalidated at once (a catalog-wide repricing, a schema change,
a feature rollout), a per-key tag sweep is the wrong tool. Put a **version counter in the key** and
bump it: every previously cached key becomes unreachable instantly, and the old keys age out by TTL.

**Incorrect (sweeping thousands of keys on every rollout):**

```typescript
// repricing shipped -> try to purge every catalog entry
await this.cache.invalidatePrefix('catalog:'); // SCAN over the whole keyspace; slow and per-node
```

Why it is wrong: a cluster-wide `SCAN` is expensive, per-node, and races with concurrent writes.

**Correct (bump a generation counter; keys change namespace):**

```typescript
// read site — the generation is part of the key
@Cacheable({
  ttl: 3600,
  swr: 300,
  key: async (args, ctx) => ['catalog', args[0], await ctx.gen('catalog')],
})
getCatalog(category: string) {}

// rollout — one INCR orphans every old key at once
await redis.incr('gen:catalog');
```

```text
before:  catalog:books:g4:...
after INCR: catalog:books:g5:...   (g4 keys expire untouched)
```

Why it is right: invalidation is O(1) and cluster-safe, and stale keys are reclaimed by their TTL
rather than by a scan.

Pair the generation with a **short hard TTL** so the old generation's keys self-clear, and cache the
counter value briefly (it is read on every key build) to avoid a Redis round-trip per call.

Reference: [Redis INCR](https://redis.io/commands/incr)
