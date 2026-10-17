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
  - `references: (info, key, result) => string[]` — tag invalidation; `result` is the **third**
    argument and `info` is the resolver bundle `{ source, args, context, info }`
  - `extendKey: (self, args, ctx) => string` — per-user keying (the no-leak control)
  - `skip: (self, args, ctx) => boolean` — bypass for auth/admin
  - `key` — custom serializer; at field level it must return a **string**, not an array
  - `storage` — per-policy memory vs redis
- Invalidate: `app.graphql.cache.invalidate(['product:42'])`
- Built on `async-cache-dedupe` → dedupe + `gc` for reference integrity.
- NestJS wiring: `plugins: [{ plugin: mercuriusCache, options: { ... } }]`.

⚠️ **Default key is global.** Without `extendKey`/`skip`, private fields leak.

⚠️ **Field level is not service level.** Here `args` is the resolver's **named-argument object**
(`args.id`, not `args[0]`), `ctx` is the **GraphQL context** (`ctx.userId`, `ctx.user`), and `self` is
the parent resolver's value. The service-level callback contract in `policy-key-derivation` does not
apply to these callbacks — only the five knobs do. mercurius-cache's own docs show `references` in two
shapes (`(args, key, result)` and `({ source, args, context, info }, key, result)`); confirm which your
pinned version calls (see `driver-version-pinning`), but in **both** `result` is a positional argument —
never a property of the first one.

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
      // info first, key second, result THIRD — destructuring `result` off the first argument yields
      // undefined and attaches no references at all
      references: ({ source, args, context, info }, key, result) =>
        (result ? [`viewer:${result.id}`] : null),
    },
  },
}
```

Why it is right: the key carries the caller (or the field is skipped), so private data never shares an
entry, and references make it revocable.

Reference: [mercurius-cache](https://github.com/mercurius-js/cache)
