---
title: Scope Covers the User Only — Every Other Dimension Goes in the Key
impact: CRITICAL
impactDescription: scope is not a substitute for key dimensions
tags: key, scope, tenant, locale, roles
---

## Scope Covers the User Only — Every Other Dimension Goes in the Key

**Impact: CRITICAL (scope is not a substitute for key dimensions)**

`@CacheScope` answers exactly one question: **may callers share this entry?** It selects between
`public` and *the requesting user's* segment. It does **not** encode tenant, locale, role/scope,
currency, feature-flag cohort, or any other dimension the result varies by.

Confusing "scope" with "which identity segments enter the key" is how a `perUser` entry still leaks
across tenants. Every result-varying dimension — user **and** everything else — must be present in the
final key: the user via `@CacheScope('perUser')`, the rest via `@Cacheable({ key })`.

**Incorrect (perUser, but tenant/locale missing from the key):**

```typescript
// two tenants share getTitle:{"a":[42],"u":123} — the tenant is not in the key
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getTitle(id: string) { return this.repo.findById(id); } // tenant-scoped in the DB, not in the key
```

Why it is wrong: user 123 has the same key in every tenant, so tenant A's row is served in tenant B.

**Correct (user via scope; every other dimension as an explicit key part):**

```typescript
@Cacheable<[string]>({
  ttl: 60,
  swr: 300,
  key: (args, ctx) => ['title', args[0], ctx.tenantId, ctx.locale, ctx.pricingCohort],
})
@CacheScope('perUser')
getTitle(id: string) {}

// stored key: getTitle:{"a":[42],"k":["title",42,"acme","en-US","B"],"u":123} — every dimension
// except the user is in `k`; the user is in `u` (see policy-key-derivation for the bundle)
```

A new dimension is added in **two** places, because `ctx` is a plain object assembled per call: the
field on `CacheContext` **and** the matching CLS read in `buildCacheContext` (both in
`setup-decorator-runtime`). `pricingCohort` above is exactly such a field — it is not magic, it is a CLS
key you set once and read here.

Why it is right: scope handles *who*, the key handles *everything else*, so two different tenants (or
locales, or flag cohorts) can never share an entry.

Rule of thumb: after writing any `@Cacheable`, list every input that can change the result — user,
tenant, locale, role/scope, currency, flag cohort — and confirm each is in the scope **or** the key.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
