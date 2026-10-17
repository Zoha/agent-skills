---
title: The Decorators Are the One Writing Pattern
impact: CRITICAL
impactDescription: one reviewable shape; no per-callsite policy drift
tags: decorators, Cacheable, CacheTag, CacheScope, InvalidateTags
---

## The Decorators Are the One Writing Pattern

**Impact: CRITICAL (one reviewable shape; no per-callsite policy drift)**

Exactly **one way to write each thing**:

- **Cache config** → `@Cacheable({ key, ttl, swr })` — the only place for key/ttl/swr.
- **Tags** → `@CacheTag(...)` — always, never an option on `@Cacheable`.
- **Scope** → `@CacheScope(...)` — always, never an option on `@Cacheable`; only to mark a caller-scoped read.
- **Invalidation** → `@InvalidateTags(...)` on the write method.

**Incorrect (scope/tags smuggled into the config object; inconsistent shapes):**

```typescript
@Cacheable({ ttl: 60, swr: 300, tags: ['title:42'], scope: 'perUser' })
getViewer(id: string) {}
```

Why it is wrong: review must read every option to find the leak-prone ones, and the shape differs
between methods so nothing is scannable.

**Correct (one decorator per concern, stackable, order-independent):**

```typescript
// public (default) — one entry shared by every caller
@Cacheable<[string]>({ ttl: 60, swr: 300, key: (args) => ['title', args[0]] })
@CacheTag((r, a) => [`title:${a[0]}`])   // (result, args) => string[]; same source as the purge below
getTitle(id: string) {}

// caller-scoped — explicit, because the result varies per caller
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getViewer(id: string) {}

// invalidate on write — runs only AFTER the method succeeds
@InvalidateTags((r, a) => [`title:${a[0]}`])
updateTitle(id: string, dto: Dto) {}
```

Why it is right: the leak-prone line (`@CacheScope('perUser')`) is a separate, greppable decorator,
and every method uses the same three shapes.

Rules:

- `@Cacheable` takes only `key`, `ttl`, `swr`. Never put `scope` or `tags` inside it.
- `@CacheTag(result, args)` returns `string[] | null` — never a bare string — and must be derived from
  the same value the matching `@InvalidateTags` uses, so the write purges exactly the string the read
  attached (see `invalidation-tags-purge-only`).
- `@InvalidateTags` fires **after success** only (see `invalidation-after-success`).
- Tags are optional — use them when you need revocation, otherwise let `ttl` expire the entry.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators)
