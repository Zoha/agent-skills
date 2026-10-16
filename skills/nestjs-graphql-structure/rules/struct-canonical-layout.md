---
title: Canonical Application Structure
impact: CRITICAL
impactDescription: the map every other placement rule hangs from
tags: structure, layout, directory, placement
---

## Canonical Application Structure

**Impact: CRITICAL (the map every other placement rule hangs from)**

**Purpose.** This is the base map for a feature-first, code-first NestJS GraphQL application.
It shows where every kind of file belongs, at the application level and inside a feature
module. Consult it first when deciding where a new file goes; then read the per-file rule for
that kind of file for its purpose, responsibilities, and examples.

**How to read it.** `common/` holds reusable, feature-agnostic building blocks; `infra/` holds
one-time infrastructure imported by the composition root; `modules/` holds both domain features
(one bounded context each) and a few small app-level modules such as `auth/` and `health/`. Inside
a feature, every *kind* of file gets its own subfolder. Files marked `OPTIONAL` exist only in the
situations their rule describes.

```text
src/
├── main.ts                        # bootstrap only: create app, global pipes/filters/interceptors, listen
├── app.module.ts                  # composition root: imports feature + infra modules, no logic
├── config/
│   ├── app.config.ts              # typed config namespace (registerAs)
│   ├── database.config.ts         # typed config namespace
│   └── validation.schema.ts       # env validation (Joi/Zod) — fail fast
├── common/                        # feature-agnostic, reusable building blocks
│   ├── constants/                 # cross-cutting constants and enums
│   ├── decorators/                # e.g. @CurrentUser(), @Public()
│   ├── directives/                # GraphQL schema directives (e.g. @Auth)
│   ├── exceptions/                # shared/base exception classes
│   ├── filters/                   # GraphQL exception filters
│   ├── guards/                    # shared auth/roles guards
│   ├── interceptors/              # logging, transform
│   ├── interfaces/                # shared ports (interface + injection token)
│   ├── pagination/                # generic Paginated<T> factory + PageInfo
│   ├── pipes/                     # shared validation/parse pipes
│   ├── scalars/                   # custom GraphQL scalars
│   ├── services/                  # shared services (hashing, ids, mailer wrapper)
│   ├── shared.module.ts           # provides + exports the shared services
│   ├── types/                     # shared types: GqlContext, AuthenticatedUser
│   └── utils/
├── infra/                         # one-time infrastructure, imported by the composition root
│   ├── database/
│   │   ├── database.module.ts     # DB connection module
│   │   ├── database.providers.ts  # provider/factory wiring
│   │   ├── migrations/            # DB migrations
│   │   └── seeds/                 # repeatable seed scripts + runner
│   ├── graphql/
│   │   ├── graphql.module.ts      # GraphQLModule.forRootAsync + schema config
│   │   └── graphql.context.ts     # per-request context: request + authenticated user
│   ├── pubsub/
│   │   └── pubsub.providers.ts    # shared PubSub provider for subscriptions
│   └── <cache|queue|…>/           # other one-time infra (queue, cache)
└── modules/
    ├── <feature>/                 # one folder per bounded context (domain feature)
    │   ├── <feature>.module.ts           # wiring: providers, imports, exports
    │   ├── resolvers/
    │   │   ├── <feature>.query.resolver.ts         # queries
    │   │   ├── <feature>.mutation.resolver.ts      # mutations
    │   │   ├── <feature>.subscription.resolver.ts  # subscriptions
    │   │   ├── <type>-<feature>.resolver.ts         # @ResolveField extending another module's type (data owner owns the field)
    │   │   └── <type>.resolver.ts                   # @ResolveField for a nested/computed type of this module
    │   ├── services/
    │   │   └── <feature>.service.ts             # domain logic (multiple per module)
    │   ├── repositories/
    │   │   └── <feature>.repository.ts          # data access only
    │   ├── providers/                           # OPTIONAL: thin wrappers over third-party SDKs
    │   ├── dto/
    │   │   ├── create-<entity>.input.ts         # @InputType (+class-validator)
    │   │   ├── find-<feature>.args.ts           # @Args() class
    │   │   └── filter-<feature>.input.ts        # OPTIONAL: filter/sort input for list queries
    │   ├── constants/                           # constants and enums (no stray values in class files)
    │   │   └── <feature>-status.enum.ts
    │   ├── entities/
    │   │   └── <entity>.entity.ts               # persistence + @ObjectType (merged default)
    │   ├── models/                              # OPTIONAL: GraphQL-only @ObjectType (e.g. <entity>.model.ts, union/interface types)
    │   ├── mappers/                             # OPTIONAL: entity ⟷ model (e.g. <entity>.mapper.ts)
    │   ├── loaders/
    │   │   └── <feature>.loader.ts              # DataLoader(s) for relations
    │   ├── events/
    │   │   ├── <feature>-<action>.event.ts      # domain event
    │   │   └── <feature>-<action>.listener.ts   # listener
    │   ├── processors/                          # OPTIONAL: queue processors (e.g. BullMQ @Processor)
    │   ├── jobs/                                # OPTIONAL: scheduled/cron jobs
    │   ├── interfaces/                          # OPTIONAL: ports + injection tokens for this feature
    │   ├── exceptions/                          # OPTIONAL: feature-local exception classes
    │   ├── guards/                              # OPTIONAL: feature-local guards/decorators
    │   └── <submodule>/                         # OPTIONAL: nested module when the feature grows (see struct-feature-decomposition)
    ├── auth/                      # app-level module: authentication (see struct-auth-feature)
    │   ├── auth.module.ts
    │   ├── resolvers/             # login / refresh / logout mutations
    │   ├── services/              # token issuance, credential checks
    │   └── strategies/            # Passport strategies (jwt.strategy.ts, local.strategy.ts)
    └── health/                    # app-level module: liveness/readiness (see struct-module-kinds)
test/
├── <feature>.e2e-spec.ts          # e2e specs (unit specs are co-located)
├── factories/                     # test data builders (aUser(), OrderFactory)
├── fixtures/                      # static test data
└── helpers/                       # shared test helpers (GraphQL request, DB reset)
```

**Consequences of the map.**

- A feature owns its own files; moving or deleting a feature is moving or deleting one folder.
- Cross-cutting code is never duplicated into features — it lives in `common/`.
- `modules/` holds domain features and a few small app-level modules (`auth/`, `health/`); both
  have one home and register once in the composition root.
- A new file kind is placed by its *role*, not by the feature it happens to serve first.

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
