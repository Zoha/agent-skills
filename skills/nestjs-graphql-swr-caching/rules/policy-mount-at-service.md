---
title: Mount at the Service Level by Default
impact: HIGH
impactDescription: cache the expensive unit of work, escalate only when measured
tags: layers, service, resolver, operation, cdn
---

## Mount at the Service Level by Default

**Impact: HIGH (cache the expensive unit of work, escalate only when measured)**

| Layer | Mount | Mechanism | Real SWR? |
|---|---|---|---|
| **Service method** (default) | `@Cacheable` on a provider | your cache layer / `async-cache-dedupe` | ✅ `stale` |
| **Field/resolver** (opt-in) | wrap resolver / decorator | same layer, `ttl`+`swr` | ✅ |
| **Operation result** | Apollo `responseCachePlugin` | TTL-only, keyed by op hash + `sessionId` | ❌ |
| **Transport / CDN** | APQ + `GET` | `Cache-Control: s-maxage, stale-while-revalidate` | ✅ (RFC 5861) |

**All five knobs are identical at service and field level.** Only two things differ:

- **Identity source** — service methods read the user from request context (CLS), not usually an
  argument. Background jobs have **no user**: pass the id explicitly as a key dimension.
- **Operation/transport layers don't exist at service level.** Apollo's response cache and CDN
  headers are transport concerns, and neither supports tag invalidation.

The **callback signatures are not** identical. At service level `args` is the method's positional
argument list (`args[0]`, and `(result, args)` on the tag callbacks — see `policy-key-derivation`). At
field level the driver hands you the resolver's **named-argument object** and the **GraphQL context** —
`extendKey: (self, args, ctx)` with `args.id`, not `args[0]`, and `ctx.userId`/`ctx.user` rather than
the skill's `CacheContext`. Do not copy a service-level callback into a field-level policy unchanged
(see `driver-mercurius-cache`).

**Incorrect (starting at the operation layer, and losing dedupe):**

```typescript
// register Apollo responseCachePlugin and call it done
plugins: [responseCachePlugin()] // TTL-only, no SWR, no tags, defeats DataLoader
```

Why it is wrong: the expensive service call still runs once per operation, there is no SWR, and no
way to invalidate on write.

**Correct (cache the service method; escalate only when measured):**

```typescript
@Injectable()
export class TitlesService {
  @Cacheable<[string]>({ ttl: 60, swr: 300 })
  @CacheTag((r, a) => [`title:${a[0]}`])   // same source as the write's purge (invalidation-tags-purge-only)
  getTitle(id: string) { return this.repo.findById(id); } // the expensive unit, cached once
}
```

Why it is right: the DB/upstream work is cached at the point it happens, dedupe covers every caller
of the method, and the resolver stays thin.

Reference: [Apollo Server caching](https://github.com/apollographql/apollo-server)
