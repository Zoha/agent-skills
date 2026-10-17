---
title: Option A — async-cache-dedupe (Service Level, Transport-Agnostic)
impact: MEDIUM
impactDescription: true SWR on Apollo without a field-level plugin
tags: async-cache-dedupe, service-level, redis, swr
---

## Option A — async-cache-dedupe (Service Level, Transport-Agnostic)

**Impact: MEDIUM (true SWR on Apollo without a field-level plugin)**

Best when you are on Apollo but want true SWR. Wrap any NestJS provider method.

- `createCache({ ttl, stale, storage, onHit, onMiss, onDedupe, onError })`
- `cache.define(name, { ttl, stale, references, serialize, transformer }, fn)`
- `cache.invalidateAll(references)` / `cache.clear(name, arg)`
- `stale` = seconds served after `ttl` expiry while refreshing (true SWR).
- **Single-flight/dedupe** built in: concurrent misses for one key → one call.
- Keys from `safe-stable-stringify`; `references` = tag-like invalidation.
- Storage `memory` | `redis` (ioredis), per-definition overrides possible.

**Incorrect (a definition with no invalidation and no storage override):**

```typescript
cache.define('getUser', (id) => db.user(id)); // no references -> cannot purge on write
```

Why it is wrong: nothing links the entry to the user it came from, so an update cannot revoke it.

**Correct (references enable tag invalidation; redis for shared):**

```typescript
cache.define('getUser', {
  ttl: 60,
  stale: 300,
  references: (args, key, result) => (result ? [`user:${result.id}`] : null),
}, (id: string) => db.user(id));

await cache.invalidateAll(['user:42']); // purge every entry referencing user 42
```

Why it is right: the entry carries a reference, so a write can revoke every read that saw the old
value.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe)
