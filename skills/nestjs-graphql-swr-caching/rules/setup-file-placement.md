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
│   │   └── cache-service.interface.ts # port + CACHE_SERVICE token
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
permits. This mirrors the canonical layout's `<cache|queue|…>` under `infra/`.

If the file-count scatter is unwanted, collapse the four decorators into the one
`common/decorators/cache.decorators.ts` file shown above (one cohesive API surface). A single
`infra/cache/` folder holding its own `decorators/`/`service/` is only acceptable with a deliberate,
documented lint exception for that path.

Reference: [NestJS Modules](https://docs.nestjs.com/modules#shared-modules)
