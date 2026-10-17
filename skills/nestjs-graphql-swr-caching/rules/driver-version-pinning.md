---
title: Pin Versions — This Area Drifts
impact: MEDIUM
impactDescription: verify option names and semantics before you rely on them
tags: versions, drift, compatibility
---

## Pin Versions — This Area Drifts

**Impact: MEDIUM (verify option names and semantics before you rely on them)**

Library option names, dependency requirements, and plugin semantics here change between releases. Verify
against your locked versions before quoting behaviour.

- Apollo Server 5; `@nestjs/apollo` v14 requires AS5 (`@apollo/server`), v13 is the previous line.
- `@nestjs/mercurius` matches `@nestjs/graphql` v13.
- `mercurius-cache` and `async-cache-dedupe` are maintained by NearForm/mcollina.
- Envelop: `session` required since v3; `ttlPerType` deprecated in favor of `ttlPerSchemaCoordinate`.
- `async-cache-dedupe`: explicit invalidation is **disabled by default**; `referencesTTL` must be set;
  Redis references need GC.
- `@nestjs/cache-manager` v6: `get()` returns `undefined` (v6) — treat `null`/`undefined` as a miss
  when migrating.

**Incorrect (relying on remembered option names):**

```typescript
// copied from an older release: option renamed / removed
ttlPerType: { User: 60 },  // deprecated -> use ttlPerSchemaCoordinate
```

Why it is wrong: silent no-op — the option is accepted but does nothing, so you believe you configured
something you did not.

**Correct (pin, then verify against the installed type definitions):**

```json
// package.json — pin the caching stack tightly
{ "async-cache-dedupe": "3.x", "ioredis": "5.x", "@nestjs/apollo": "14.x", "@apollo/server": "5.x" }
```

Why it is right: a pinned stack makes the guidance in this skill reproducible, and a mismatch is caught
at install rather than in production.

Rule: before adopting any option from this skill, open the installed package's type definitions (or its
README at your pinned version) and confirm the option still exists and means what you expect.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe)
