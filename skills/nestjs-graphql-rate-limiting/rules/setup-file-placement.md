---
title: Place the Capability by Who Imports It
impact: CRITICAL
impactDescription: keeps infrastructure out of features and keeps the decorators importable
tags: file-placement, infra, common, structure
---

## Place the Capability by Who Imports It

**Impact: CRITICAL (keeps infrastructure out of features and keeps the decorators importable)**

Rate limiting is a **capability** with two halves, and one rule decides where each file goes:

> A file goes to `infra/` if **only the composition root** imports it; to `common/` if **feature code**
> imports it.

That is the general rule already owned by `nestjs-graphql-structure` — see its `struct-canonical-layout`
(`infra/` holds one-time infrastructure) and `infra-common` (`common/{decorators,guards,...}`). Follow
it there; only the rate-limiting-specific consequences are below.

**Incorrect (one flat folder features reach into for infrastructure):**

```text
src/rate-limit/
  rate-limit.module.ts      # infrastructure, but sits beside feature-imported decorators
  throttler.storage.ts
  decorators.ts
  rate-limit.guard.ts
```

Why it is wrong: the folder mixes "composition-root-only" with "feature-imported", so a boundary lint
cannot tell them apart and a feature can import the storage client.

**Correct (split by importer; the module boundary lint enforces it):**

```text
src/
├── config/
│   └── rate-limit.config.ts          # typed namespace (registerAs)
├── common/
│   ├── guards/
│   │   └── gql-throttler.guard.ts    # the guard — registered globally, also @UseGuards-able
│   └── decorators/
│       └── rate-limit.decorators.ts  # @RateLimit / @SkipRateLimit / @RateLimitCost
├── infra/
│   ├── rate-limit/                   # ONLY the composition root imports this
│   │   ├── rate-limit.module.ts      # ThrottlerModule.forRootAsync wiring
│   │   ├── rate-limit.storage.ts     # the shared store (and the fail-open decorator)
│   │   └── rate-limit.tokens.ts
│   └── graphql/
│       └── graphql.module.ts         # depth / complexity validation rules live here
└── app.module.ts                     # imports RateLimitModule; registers APP_GUARD
```

Why it is right: infrastructure stays behind `infra/` (features may import `common/` but never
`infra/`), the guard and decorators that feature source files import live where the boundary permits,
and the config namespace sits in `config/` like every other one.

The depth and complexity rules are part of the **GraphQL server configuration**, so they belong in
`infra/graphql/` — not in a feature and not in `common/`. Do not create a feature-level rate-limiting
module: a module that only registers providers the composition root already registers is a duplicate.

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS GraphQL other features](https://docs.nestjs.com/graphql/other-features)
