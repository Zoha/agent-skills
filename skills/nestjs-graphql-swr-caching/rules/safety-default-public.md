---
title: Scope Defaults to Public — Mark Caller-Varying Reads perUser
impact: CRITICAL
impactDescription: the default is a leak by design; the decorator is the review line
tags: scope, perUser, public, leak
---

## Scope Defaults to Public — Mark Caller-Varying Reads perUser

**Impact: CRITICAL (the default is a leak by design; the decorator is the review line)**

A cache entry is shared by **every** caller unless you say otherwise. That is only correct when the
result is byte-identical for all of them. Any result that varies by caller **must** carry
`@CacheScope('perUser')`; that decorator is the line a reviewer scrutinizes.

- Anonymous `perUser` → **bypass** the cache (never key under an empty identity).
- The user identity comes from **verified auth**, never a raw client header.

**Incorrect (a caller-varying read left public):**

```typescript
@Cacheable({ ttl: 60, swr: 300 })   // no @CacheScope -> public
getViewerDashboard() { return this.repo.dashboardFor(this.cls.get('userId')); }
```

Why it is wrong: the first caller's dashboard is cached and served to everyone — a data leak, not a
slow cache.

**Correct (explicit perUser, with an anonymous bypass):**

```typescript
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getViewerDashboard() { return this.repo.dashboardFor(this.cls.get('userId')); }

// public is only correct when the result is identical for every caller
@Cacheable({ ttl: 60, swr: 300 })
getPopularTitles() { return this.repo.popular(); }
```

```text
public   →  getViewerDashboard:{"a":[]}            ← served to every caller (WRONG when it varies)
perUser  →  getViewerDashboard:{"a":[],"u":123}    ← only user 123 reads this
```

Why it is right: the caller-scoped read carries the explicit decorator, and the anonymous case
bypasses instead of colliding under one empty key.

Reference: [NestJS Guards](https://docs.nestjs.com/guards)
