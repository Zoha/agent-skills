---
title: Option B — mercurius-cache (Field Level, Real SWR)
impact: MEDIUM
impactDescription: the only first-class per-field SWR cache, if you are on Mercurius
tags: mercurius-cache, field-level, extendKey, skip
---

## Option B — mercurius-cache (Field Level, Real SWR)

**Impact: MEDIUM (the only first-class per-field SWR cache, if you are on Mercurius)**

Only first-class option that caches **per resolver field** with a real SWR window.

- Global: `ttl`, `stale`, `all`, `storage: { type: 'memory'|'redis' }`
- Per-policy (`policy: { Type: { field: {...} } }`):
  - `ttl`, `stale` (per-field)
  - `references: (args, key, result) => string[]` — tag invalidation
  - `extendKey: (self, args, ctx) => string` — per-user keying (the no-leak control)
  - `skip: (self, args, ctx) => boolean` — bypass for auth/admin
  - `key` — custom serializer; `storage` — per-policy memory vs redis
- Invalidate: `app.graphql.cache.invalidate(['product:42'])`
- Built on `async-cache-dedupe` → dedupe + `gc` for reference integrity.
- NestJS wiring: `plugins: [{ plugin: mercuriusCache, options: { ... } }]`.

⚠️ **Default key is global.** Without `extendKey`/`skip`, private fields leak.

**Incorrect (global key on a viewer field):**

```typescript
policy: { Query: { viewer: true } } // shared key -> one user's viewer served to all
```

Why it is wrong: the default key does not include the caller, so the field is a leak.

**Correct (extendKey per user; skip for privileged callers):**

```typescript
policy: {
  Query: {
    viewer: {
      ttl: 60,
      stale: 300,
      extendKey: (self, args, ctx) => (ctx.userId ? `user:${ctx.userId}` : undefined),
      skip: (self, args, ctx) => !!ctx.user?.isAdmin,
      references: ({ args, result }) => (result ? [`viewer:${result.id}`] : null),
    },
  },
}
```

Why it is right: the key carries the caller (or the field is skipped), so private data never shares an
entry, and references make it revocable.

Reference: [mercurius-cache](https://github.com/mercurius-js/cache)
