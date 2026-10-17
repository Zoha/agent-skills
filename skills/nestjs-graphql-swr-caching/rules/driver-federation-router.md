---
title: Federation Only — Apollo Router Response Caching
impact: LOW-MEDIUM
impactDescription: entity-level caching at the router; SWR not yet honored
tags: federation, apollo-router, cacheTag, invalidation
---

## Federation Only — Apollo Router Response Caching

**Impact: LOW-MEDIUM (entity-level caching at the router; SWR not yet honored)**

Router-level (v2.10+, preview): Redis, **entity-level** caching, `@cacheControl` for TTL and
`@cacheTag` for tag-based invalidation via an `/invalidation` endpoint.

**SWR is parsed/serialized but not yet honored** — do not rely on it here.

**Incorrect (assuming the router serves stale in the SWR window):**

```graphql
# expect the router to serve stale while revalidating
type Product @cacheControl(maxAge: 60) @cacheTag(format: "product:{id}") { id: ID! }
```

Why it is wrong: the router accepts the directive but does not revalidate in the background, so expiry
is still a miss at the router.

**Correct (use the router for TTL + tag invalidation; get SWR from the subgraph/service layer):**

```text
router:  @cacheControl(maxAge) + @cacheTag  -> TTL + tag invalidation
service: @Cacheable({ ttl, swr })           -> true stale-while-revalidate
```

Why it is right: each layer does what it actually supports.

This is a **federation-only** concern; in a single-service app it does not apply.

Reference: [Apollo Router caching](https://www.apollographql.com/docs/router/configuration/response-caching/)
