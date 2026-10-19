---
title: Gate Introspection and Require Persisted Queries
impact: MEDIUM
impactDescription: a public schema plus arbitrary documents is the attack surface
tags: introspection, persisted-queries, apq, production
---

## Gate Introspection and Require Persisted Queries

**Impact: MEDIUM (a public schema plus arbitrary documents is the attack surface)**

Depth, cost and breadth rules bound *how bad* an arbitrary document can be. The stronger posture is to
stop accepting arbitrary documents at all: disable introspection in production, and let clients send a
**persisted query hash** (`GET`) so the server only ever executes documents it has seen and vetted.
Bounded documents + known documents is defence in depth; either alone is not.

**Incorrect (introspection always on, arbitrary documents always allowed):**

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  introspection: true,          // exposes the full schema to anyone, in production too
  // persistedQueries not configured -> every client may send any document it likes
});
```

Why it is wrong: an attacker reads the whole schema (including the expensive fields) and then crafts
documents exactly at the edges of your limits.

**Correct (introspection gated by environment, persisted queries required in production):**

```typescript
// infra/graphql/graphql.module.ts
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    introspection: config.get('app.nodeEnv') !== 'production',   // dev tooling keeps it; prod does not
    persistedQueries: {
      cache: new RedisPersistedQueryCache(config.get('rateLimit.redisUrl')),  // by hash
    },
    // `allowBatchedHttpRequests: false` — see `op-count-operations`
  }),
})
```

```typescript
// infra/graphql/graphql.module.ts — for a hard allow-list, add an APQ-aware plugin that
// rejects any document not in the persisted set (a cache miss must NOT fall back to executing
// an arbitrary query in production).
```

Why it is right: production executes only vetted documents, arbitrary-document abuse is off the table,
and the depth/cost rules become a backstop for the still-allowed `POST` path rather than the only
defence.

Notes and traps:

- **APQ is not an allow-list by itself.** With automatic persisted queries, a cache miss means the
  server accepts and stores the full query — so it does *not* restrict what can run. To actually
  restrict, run a **trusted document / allow-list** mode (only hashes you published are honoured).
  Choose APQ for bandwidth and trusted documents for security; they are different products.
- **Disabling introspection breaks GraphiQL and some client tooling** — gate it by environment, and
  keep it on in non-production.
- **Introspection bypasses depth by default** (`graphql-depth-limit` ignores introspection fields) —
  if you allow introspection in production, cap it too rather than assuming the depth rule covers it.
- **`GET` + CDN** is where persisted queries earn their keep: a hash is cacheable at the edge, which is
  also why the edge layer (`edge-defense-in-depth`) should be configured to cache it.

Reference: [Apollo Server provisioning](https://www.apollographql.com/docs/apollo-server/performance/apq/) | [NestJS GraphQL other features](https://docs.nestjs.com/graphql/other-features)
