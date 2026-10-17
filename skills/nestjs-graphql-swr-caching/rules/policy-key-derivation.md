---
title: Derive the Key Automatically, Never with JSON.stringify
impact: HIGH
impactDescription: stable, collision-free keys without per-callsite hand-rolling
tags: key, stable-stringify, serialization
---

## Derive the Key Automatically, Never with JSON.stringify

**Impact: HIGH (stable, collision-free keys without per-callsite hand-rolling)**

The engine keys an entry on the **name** you passed to `define` plus a **stable** serialization of the
argument it receives (`safe-stable-stringify`: key-order independent, circular-safe). The decorator
wrapper passes one bundle — `{ a: args, k: keyParts, u: userId }` — so that bundle *is* the key.
Override `key` only to add extra dimensions. Never use `JSON.stringify` yourself — its key order
follows insertion order, so the same logical input can produce different keys and silently miss (or,
worse, collide).

**Incorrect (unstable serialization; hand-built keys everywhere):**

```typescript
const key = `title:${JSON.stringify(dto)}`; // {a:1,b:2} and {b:2,a:1} hash differently
```

Why it is wrong: object key order changes the key, so the cache misses arbitrarily and entries
fragment.

**Correct (auto-derived, with an explicit override only for extra dimensions):**

```typescript
// default — the wrapper passes the method's arguments through unchanged, so the stored key is the
// name plus that bundle:  TitlesService.getTitle:{"a":[42]}
@Cacheable({ ttl: 60, swr: 300 })
getTitle(id: string) {}

// override ONLY to add a dimension the args do not carry (locale, tenant, or a job with no request)
@Cacheable({ ttl: 60, swr: 300, key: (args, ctx) => ['title', args[0], ctx.locale] })
getTitle(id: string) {}
```

**The callback contract** — one shape, everywhere in this skill:

```typescript
type CacheKeyFn = (args: unknown[], ctx: CacheContext) => unknown[] | Promise<unknown[]>;

interface CacheContext {
  userId?: string; tenantId?: string; locale?: string;   // from CLS, per request
  gen(name: string): Promise<number>;                     // generation counter (see invalidation-generation-prefix)
}
```

- `args` is the method's **argument list, in call order**, so `args[0]` is the first parameter.
  `@CacheTag` and `@InvalidateTags` receive the same list as their second argument. An example that
  reads `a.id` off a method taking a bare `id` is wrong — it yields `undefined`.
- `ctx` carries the request-derived dimensions a positional argument cannot hold. It is empty outside
  a request, so a job or subscription must pass the value it needs as an argument instead (see
  `setup-identity-context`).
- Return an **array of primitives** (or a promise of one, for a key that needs `ctx.gen`). It becomes
  the `k` part of the stored bundle, so the final key stays stable and readable in events.

Why it is right: the default key is stable and named after the method, an override is a visible,
reviewable decision rather than the norm, and the callback shape is the same everywhere.

Also: the key must be **readable in events, not hashed** (see `observability-structured-events`), and
must never contain secrets.

Reference: [safe-stable-stringify](https://github.com/BridgeAR/safe-stable-stringify)
