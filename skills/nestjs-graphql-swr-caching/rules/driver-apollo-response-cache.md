---
title: Option C — Apollo responseCachePlugin (Operation Level, TTL Only)
impact: MEDIUM
impactDescription: minimal code, no SWR, and code-first directive gotchas
tags: apollo, responseCachePlugin, cacheControl, TTL-only
---

## Option C — Apollo responseCachePlugin (Operation Level, TTL Only)

**Impact: MEDIUM (minimal code, no SWR, and code-first directive gotchas)**

`@apollo/server-plugin-response-cache` (AS4+). Minimal code, operation-level, **no SWR**.

- Field hints via `@cacheControl(maxAge, scope, inheritMaxAge)` or `info.cacheControl.setCacheHint`.
- Response `maxAge` = **min** across included fields; `maxAge 0` anywhere → not cached.
- Response `scope` = `PRIVATE` if **any** field is `PRIVATE`. Root/object fields default to `maxAge 0`
  (opt-in only).
- Key = `source + operationName + variables + extraCacheKeyData (+ sessionId)`.
- `PUBLIC` splits into **2 buckets** (logged-out vs logged-in), *not* per-user.
- `PRIVATE` requires `sessionId`, else **not cached at all**.
- `options.cache` = a `KeyValueCache` → Redis via `@keyv/redis`.
- Never caches errors; sets `Age` on hits.
- Hooks: `sessionId`, `extraCacheKeyData`, `shouldReadFromCache`, `shouldWriteToCache`, `generateCacheKey`.
- **No stale-while-revalidate** — the pipeline cannot re-dispatch a background refresh.

### Code-first `@cacheControl` gotchas (NestJS)

- AS v5 no longer auto-inserts the directive — declare `@cacheControl` + `CacheControlScope` in
  `buildSchemaOptions.directives`.
- **Child object types and `@ResolveField`s must set `maxAge` or `inheritMaxAge: true`**, or their
  default `maxAge 0` cancels the whole cache.
- `@Directive('@cacheControl(...)')` emits the header but caches nothing until `responseCachePlugin` is
  registered.
- Helper lib: `nestjs-gql-cache-control`.
- `@nestjs/cache-manager`'s `CacheInterceptor` **does not work globally in GraphQL** — interceptors run
  per field resolver. Cache inside services instead.

**Incorrect (PRIVATE scope with no sessionId; child type left at default maxAge):**

```typescript
@Query(() => User)
@CacheControl({ maxAge: 60, scope: CacheControlScope.PRIVATE }) // no sessionId -> never cached
user() { /* ... */ }
// and User's @ResolveField has no inheritMaxAge -> maxAge 0 cancels the whole response
```

Why it is wrong: `PUBLIC` is not per-user, and `PRIVATE` without a `sessionId` silently caches nothing —
so the directive appears to do nothing.

**Correct (declare the directive, provide sessionId, inherit on children):**

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  buildSchemaOptions: { directives: [CacheControlDirective] }, // AS5: declare it yourself
  plugins: [responseCachePlugin({ sessionId: ({ context }) => context.req.user?.id ?? null })],
});
```

Why it is right: the directive is registered, private responses get the identity the plugin needs, and
child fields inherit the TTL instead of cancelling it.

Reference: [Apollo Server caching](https://github.com/apollographql/apollo-server)
