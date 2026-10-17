---
title: Derive the Key Automatically, Never with JSON.stringify
impact: HIGH
impactDescription: stable, collision-free keys without per-callsite hand-rolling
tags: key, stable-stringify, serialization
---

## Derive the Key Automatically, Never with JSON.stringify

**Impact: HIGH (stable, collision-free keys without per-callsite hand-rolling)**

The engine derives the key as `Class.method` + a **stable** serialization of the arguments
(`safe-stable-stringify`: key order independent, circular-safe). Override `key` only to add extra
dimensions. Never use `JSON.stringify` — its key order follows insertion order, so the same logical
input can produce different keys and silently miss (or, worse, collide).

**Incorrect (unstable serialization; hand-built keys everywhere):**

```typescript
const key = `title:${JSON.stringify(dto)}`; // {a:1,b:2} and {b:2,a:1} hash differently
```

Why it is wrong: object key order changes the key, so the cache misses arbitrarily and entries
fragment.

**Correct (auto-derived, with an explicit override only for extra dimensions):**

```typescript
// auto: "TitlesService.getTitle:{id:42}" via safe-stable-stringify(args)
@Cacheable({ ttl: 60, swr: 300 })
getTitle(id: string) {}

// override ONLY to add a dimension the args do not carry (e.g. locale, or a job with no request)
@Cacheable({ ttl: 60, swr: 300, key: (a, ctx) => ['title', a.id, ctx.locale] })
getTitle(id: string) {}
```

Why it is right: the default key is stable and named after the method, and an override is a visible,
reviewable decision rather than the norm.

Also: the key must be **readable in events, not hashed** (see `observability-structured-events`), and
must never contain secrets.

Reference: [safe-stable-stringify](https://github.com/BridgeAR/safe-stable-stringify)
