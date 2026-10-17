---
title: Know the Five Knobs
impact: CRITICAL
impactDescription: one vocabulary for every caching decision
tags: key, tag, scope, ttl, swr
---

## Know the Five Knobs

**Impact: CRITICAL (one vocabulary for every caching decision)**

Every caching decision is expressed with the same five knobs. Name them consistently.

| Knob | Answers | Notes |
|---|---|---|
| **key** | "Which single value is this?" | Where it's stored. Must encode **every** result-varying input (user, tenant, locale). 1:1. |
| **tag** | "What to purge when X changes?" | Reverse index for invalidation. **Not** for lookup. A value can carry many tags. |
| **scope** | "May callers share this?" | `public` (**default**) = byte-identical for everyone; `perUser` = caller-scoped. |
| **ttl** | "How long is it *fresh*?" | In-window: served as-is, no work. |
| **swr** | "After fresh, how long may I serve it *while refreshing*?" | Served instantly + background refresh. **Hard expiry = ttl + swr.** |

```
t=0 ─────────── ttl ────────────── ttl+swr ─────────────►
  ███ FRESH ███   ▒▒▒ STALE (served + bg refresh) ▒▒▒   ✗ GONE
  served instantly   served instantly, one deduped refresh   next call BLOCKS (miss)
```

`swr` removes the revalidation cliff — but only with **single-flight/dedupe**, so N concurrent stale
reads trigger **one** refresh, not N.

Scope ⇄ key, mechanically:

```
public   →  cache:svc.getTitle:{id:42}          ← everyone reads this
perUser  →  cache:svc.getTitle:u:123:{id:42}    ← only user 123 reads this
```

**Incorrect (TTL-only, unnamed windows):**

```typescript
@Cacheable({ ttl: 360 }) // 360 what? and a blocking miss at expiry
```

Why it is wrong: a single number cannot express "fresh" vs "serve-while-refreshing", so every expiry
is a blocking miss and you get the stampede you were trying to remove.

**Correct (name the two windows):**

```typescript
@Cacheable({ ttl: 60, swr: 300 }) // fresh for 60s, then served stale for 300s while one refresh runs
```

Why it is right: `ttl` and `swr` are separate, named, and the hard expiry (`ttl + swr`) is explicit.

Reference: [RFC 5861 stale-while-revalidate](https://www.rfc-editor.org/rfc/rfc5861)
