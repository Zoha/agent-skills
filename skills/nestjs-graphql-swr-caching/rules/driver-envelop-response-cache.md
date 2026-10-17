---
title: Option D — Envelop useResponseCache (Not Native to NestJS)
impact: MEDIUM
impactDescription: most complete semantics, but needs Yoga hosting
tags: envelop, yoga, response-cache, ttlPerSchemaCoordinate
---

## Option D — Envelop useResponseCache (Not Native to NestJS)

**Impact: MEDIUM (most complete semantics, but needs Yoga hosting)**

Most complete semantics, but it is the GraphQL Yoga plugin engine — needs Yoga hosting, no official
NestJS adapter.

- `ttl`, `ttlPerType` / `ttlPerSchemaCoordinate`, `ignoredTypes`, `shouldCacheResult`
- `session: ctx => String(ctx.user?.id)` — **required** (no global default, for security)
- `enabled: ctx => !isAdmin(ctx.user)`
- Auto-invalidate from mutation selection sets (`invalidateViaMutation`) + manual
  `cache.invalidate([{ typename, id }])`
- `Cache` interface → Redis / Cloudflare KV
- Debug: `extensions.responseCache.hit`, `invalidatedEntities`

**Incorrect (no `session` — disabled by design):**

```typescript
useResponseCache({ ttl: 60 }); // no session -> private results are not cached (safe, but useless here)
```

Why it is wrong: without a `session` callback there is no per-user key, so anything caller-varying is
refused rather than leaked — safe, but you get no personalization caching.

**Correct (explicit session; opt-out for privileged callers):**

```typescript
useResponseCache({
  ttl: 60,
  session: (ctx) => String(ctx.user?.id),   // required: per-user key
  enabled: (ctx) => !ctx.user?.isAdmin,      // bypass for admin views
  invalidateViaMutation: true,
});
```

Why it is right: the key is per-user by construction, privileged callers bypass, and mutations
auto-invalidate what they touched.

**Not a drop-in for NestJS.** Adopting it means hosting Yoga; if you are on `@nestjs/apollo` this is not
the practical path.

Reference: [Envelop useResponseCache](https://the-guild.dev/graphql/envelop/plugins/use-response-cache)
