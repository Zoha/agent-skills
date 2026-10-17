---
title: Pick the Field-Level Option from Your Driver
impact: MEDIUM
impactDescription: Apollo has no SWR; Mercurius does
tags: apollo, mercurius, driver, nestjs
---

## Pick the Field-Level Option from Your Driver

**Impact: MEDIUM (Apollo has no SWR; Mercurius does)**

NestJS supports two official GraphQL drivers, and the choice decides which field-level cache you can
use:

- `@nestjs/apollo` (Apollo Server — the common case, Express/Fastify).
- `@nestjs/mercurius` (Mercurius on Fastify).

Apollo has no SWR; Mercurius's `mercurius-cache` does. Either way, the **service-level** layer in this
skill works on both.

**Incorrect (assuming Apollo gives you SWR):**

```typescript
// on Apollo, expecting stale-while-revalidate from a response-cache plugin
plugins: [responseCachePlugin()]; // TTL-only; no SWR, no tags
```

Why it is wrong: Apollo's plugin cannot re-dispatch a background refresh, so every expiry is a blocking
miss — the exact spike you were removing.

**Correct (choose per driver; service layer either way):**

```typescript
// Mercurius: field-level with a real SWR window
MercuriusModule.forRoot({
  plugins: [{ plugin: mercuriusCache, options: { ttl: 60, stale: 300, /* policy per field */ } }],
});

// Apollo: get SWR from the service-level layer, not the server plugin
@Cacheable({ ttl: 60, swr: 300 }) getTitle(id: string) {}
```

Why it is right: the field-level capability matches the driver, and SWR comes from the layer that can
actually do it.

Reference: [NestJS GraphQL Quick start](https://docs.nestjs.com/graphql/quick-start)
