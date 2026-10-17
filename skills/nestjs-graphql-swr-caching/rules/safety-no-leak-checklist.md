---
title: Run the No-Leak Checklist on Every Cached Read
impact: CRITICAL
impactDescription: one list that catches the leaks before they ship
tags: checklist, leak, review
---

## Run the No-Leak Checklist on Every Cached Read

**Impact: CRITICAL (one list that catches the leaks before they ship)**

Before any cached read merges, confirm every line:

- [ ] Default is `public`; anything caller-varying **must** carry `@CacheScope('perUser')`.
- [ ] Key contains **every** result-varying input: user, tenant, locale, role/scope, currency, flag cohort.
- [ ] Anonymous `perUser` fields bypass.
- [ ] Never cache errors (a rejected loader leaves the cache untouched).
- [ ] Negative results (`null` / "not found") are a deliberate decision — cache them only with a
      short TTL, or a bad id hammers the source on every request.
- [ ] Tag index has a **cardinality ceiling**; purge atomically (`SMEMBERS`+`UNLINK` in one Lua script),
      never `KEYS`/unbounded `SCAN`.
- [ ] `referencesTTL` ≥ longest `ttl + swr`, and references are garbage-collected.
- [ ] CDN: never ship `must-revalidate`/`private` alongside `stale-while-revalidate` — they silently
      disable it.
- [ ] User identity comes from verified auth, never a raw client header.
- [ ] Cached values are plain serializable data (`.lean()`/DTOs) — never hydrated documents.

**Incorrect (a read that "looks fine" passes review):**

```typescript
@Cacheable({ ttl: 300, swr: 0 })
getAccount() { return this.repo.for(this.cls.get('userId')); } // public + no swr + no tags
```

Why it is wrong: it fails four checklist lines at once (public leak, no SWR, no revocation, unknown
negative behaviour) and nothing in the code says so.

**Correct (the checklist is satisfied visibly in the annotation):**

```typescript
@Cacheable({ ttl: 300, swr: 300, key: (a, ctx) => ['account', ctx.tenantId] })
@CacheScope('perUser')
@CacheTag((r) => `account:${r.id}`)
getAccount() { return this.repo.for(this.cls.get('userId')); }
```

Why it is right: scope, extra dimension, SWR, and a revocation tag are each visible, so the checklist
is a glance rather than an investigation.

Reference: [async-cache-dedupe invalidation](https://github.com/mcollina/async-cache-dedupe)
