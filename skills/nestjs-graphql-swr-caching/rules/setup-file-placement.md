---
title: Place the Capability by Who Imports It
impact: CRITICAL
impactDescription: keeps infrastructure out of features and decorators feature-importable
tags: nestjs, structure, infra, common, module-boundaries
---

## Place the Capability by Who Imports It

**Impact: CRITICAL (keeps infrastructure out of features and decorators feature-importable)**

Caching is a **capability** with two halves: an infrastructure half that only the composition root
imports, and a surface half that feature code imports. One rule decides where each file goes:

> A file goes to `infra/` if **only the composition root** imports it; to `common/` if **feature code**
> imports it.

Do not create a flat `src/cache/` folder, and do not invent a `common/<capability>/` folder for file
kinds that already have homes.

That split is the **general** rule, already owned by the `nestjs-graphql-structure` skill: see its
`struct-canonical-layout` (`infra/` holds one-time infrastructure, including the `<cache|queue|…>`
slot) and `infra-common` (`common/{decorators,filters,guards,interceptors,pipes,scalars,utils}`).
Follow it there rather than re-deriving it; only the cache-specific consequences are below.

**Incorrect (one flat folder features reach into for infrastructure):**

```text
src/cache/
  cache.module.ts          # infrastructure, but sits beside feature-imported decorators
  swr-cache.service.ts
  decorators.ts
```

Why it is wrong: the folder mixes "composition-root-only" with "feature-imported", so a boundary
lint cannot tell them apart — and a feature can now import the driver.

**Correct (split by importer; the module boundary lint enforces it):**

```text
src/
├── config/
│   └── cache.config.ts                # typed namespace (registerAs)
├── infra/
│   └── cache/                         # ONLY the composition root imports this
│       ├── cache.module.ts            # forRootAsync wiring
│       ├── cache.providers.ts         # createCache(...) -> CACHE_CLIENT
│       └── cache.tokens.ts
├── common/
│   ├── decorators/
│   │   └── cache.decorators.ts        # @Cacheable/@CacheTag/@CacheScope/@InvalidateTags
│   ├── interfaces/
│   │   └── cache-service.interface.ts # the CacheService port (token: infra/cache/cache.tokens.ts)
│   ├── services/
│   │   └── cache.service.ts
│   ├── interceptors/
│   │   └── cache-trace.interceptor.ts
│   └── types/
│       └── cache-event.ts
└── app.module.ts                      # imports CacheModule; registers APP_INTERCEPTOR
```

Why it is right: infrastructure stays behind `infra/` (features may import `common/` but never
`infra/`), and the decorators — which feature source files import — live where the boundary rule
permits. The cache folder lands exactly where the canonical layout's `<cache|queue|…>` slot already
reserves it.

**Why `CacheModule` is `@Global()`.** `setup-module-wiring` registers the module globally, which the
sibling skill's `infra-shared-module` rule otherwise discourages. The exception is deliberate:
features must not import `infra/` (the boundary rule above), so a global module is how `CACHE_CLIENT`
reaches them without inverting the dependency direction. Put a comment at the `@Global()` site saying
so, so a reader applying both skills sees why the exception is there.

If the file-count scatter is unwanted, collapse the four decorators into the one
`common/decorators/cache.decorators.ts` file shown above (one cohesive API surface). A single
`infra/cache/` folder holding its own `decorators/`/`service/` is only acceptable with a deliberate,
documented lint exception for that path.

Reference: [NestJS Modules](https://docs.nestjs.com/modules#shared-modules)
