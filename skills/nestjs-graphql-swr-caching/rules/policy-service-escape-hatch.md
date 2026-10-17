---
title: The Service API Is an Escape Hatch, Not a Second Pattern
impact: MEDIUM
impactDescription: keeps policy visible at the definition site
tags: cache-service, runtime-policy, escape-hatch
---

## The Service API Is an Escape Hatch, Not a Second Pattern

**Impact: MEDIUM (keeps policy visible at the definition site)**

A programmatic `CacheService` exists for policies that **cannot** be expressed at decorator time —
keys computed from a runtime value, or call sites that are not providers. It is **not** a second
writing pattern: the decorators are the one way, and they are always preferred for readability.

**Incorrect (reaching for the service by default):**

```typescript
async getTitle(id: string) {
  return this.cache.wrap({ key: `title:${id}`, ttl: 60, swr: 300, load: () => this.repo.find(id) });
}
```

Why it is wrong: the policy is buried in the method body, is not greppable, and drifts per call site.

**Correct (decorator by default; service only when the policy is truly runtime-computed):**

```typescript
// default: the policy is on the method, visible in review
@Cacheable({ ttl: 60, swr: 300 })
getTitle(id: string) {}

// escape hatch: the TTL genuinely depends on a runtime decision
async getFeed(segment: string) {
  const policy = await this.policies.forSegment(segment); // runtime-computed
  return this.cache.wrap({ key: ['feed', segment], ...policy, load: () => this.repo.feed(segment) });
}
```

Why it is right: the common case stays declarative and greppable, and the service is reserved for
policies that genuinely cannot be written as a decorator.

Reference: [NestJS Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
