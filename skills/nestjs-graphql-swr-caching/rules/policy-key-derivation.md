---
title: Derive the Key Automatically, Never with JSON.stringify
impact: HIGH
impactDescription: stable, collision-free keys without per-callsite hand-rolling
tags: key, stable-stringify, serialization, args, callback, typing
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
@Cacheable<[string]>({ ttl: 60, swr: 300 })
getTitle(id: string) {}

// override ONLY to add a dimension the args do not carry (locale, tenant, or a job with no request)
@Cacheable<[string]>({ ttl: 60, swr: 300, key: (args, ctx) => ['title', args[0], ctx.locale] })
getTitle(id: string) {}
```

**The callback contract** — canonical: every other rule in this skill refers here.

```typescript
type CacheKeyFn<TArgs extends unknown[] = unknown[]> =
  (args: TArgs, ctx: CacheContext) => unknown[] | Promise<unknown[]>;

type TagFn<TArgs extends unknown[] = unknown[], TResult = unknown> =
  (result: TResult, args: TArgs) => string[] | null;

interface CacheContext {
  userId?: string; tenantId?: string; locale?: string;   // from CLS, built per call (see setup-decorator-runtime)
  pricingCohort?: string;                                // …and any other request-derived dimension
  gen(name: string): Promise<number>;                    // generation counter (see invalidation-generation-prefix)
}
```

**What each parameter is, and where it comes from:**

| Callback | Receives | What builds it |
|---|---|---|
| `key(args, ctx)` | `args` = the method's **argument list, in call order**; `ctx` = request-derived dimensions | `args` is the wrapper's rest-parameter array; `ctx` comes from `buildCacheContext` (`setup-decorator-runtime`) |
| `@CacheTag(result, args)` | `result` = the method's **return value**; `args` = that same argument list | the resolved value the engine is about to store |
| `@InvalidateTags(result, args)` | same shape as `@CacheTag` — **result first** | the write's return value, after it resolves |

- `args[0]` is the first parameter — the list is positional, never a property. Reading `args.id` off a
  method whose first parameter is a bare `id` yields `undefined`.
- `ctx` carries the request-derived dimensions a positional argument cannot hold. It is empty outside
  a request, so a job or subscription must pass the value it needs as an argument instead (see
  `setup-identity-context`).
- Return an **array of primitives** (or a promise of one, for a key that needs `ctx.gen`). It becomes
  the `k` part of the stored bundle, so the final key stays stable and readable in events.

**Typing the callbacks.** The defaults are `unknown[]` / `unknown`, so a template literal like
`` `title:${a[0]}` `` does not type-check. Annotate the argument tuple once, per method — the first
type argument is always the tuple, so the decorators line up:

```typescript
@Cacheable<[string]>({ ttl: 60, swr: 300, key: (args) => ['title', args[0]] }) // args[0]: string
@CacheTag<[string]>((r, a) => [`title:${a[0]}`])                              // a[0]: string
getTitle(id: string) {}
```

**How the stored key is assembled.** The wrapper always keys on the whole bundle
`{ a: args, k: keyParts, u: userId }`, so a `key` override is **additive** — the raw arguments stay in
`a` even when you pass an override:

```text
TitlesService.getTitle:{"a":[42]}                           ← no override
TitlesService.getTitle:{"a":[42],"k":["title",42,"en-US"]}  ← with key: (args, ctx) => ['title', args[0], ctx.locale]
```

An override may repeat the arguments in `k` (readable in events) or return only the extra dimensions;
either way `a` is present. Confirm the real key from an event (`observability-structured-events`)
instead of guessing from a diagram.

**Serialization edge cases (they change the key):**

- `args` is serialized as-is, so `getTitle(42)` and `getTitle(42, undefined)` produce **different**
  keys (`[42]` vs `[42,null]`). Call the method the same way everywhere, or normalize in the override.
- An argument that is not plain data (a `Date`, an `ObjectId`, a document/DTO instance) is serialized by
  its own shape. Pass the id, not the entity.
- `key` may be **async** (for `ctx.gen`); `@CacheTag` / `@InvalidateTags` are **synchronous** — they
  return `string[] | null`, never a promise.

Why it is right: the default key is stable and named after the method, an override is a visible,
reviewable decision rather than the norm, and the service-level callback shape is the same everywhere.
At the **field/resolver** layer the driver supplies its own signatures — there `args` is the resolver's
named-argument object and `ctx` is the GraphQL context (see `driver-mercurius-cache`).

Also: the key must be **readable in events, not hashed** (see `observability-structured-events`), and
must never contain secrets.

Reference: [safe-stable-stringify](https://github.com/BridgeAR/safe-stable-stringify)
