# NestJS GraphQL Application Structure

**Version 1.4.0**
NestJS GraphQL Structure
October 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

File-placement and anatomy guide for NestJS GraphQL applications, designed for AI agents and LLMs. Teaches where every file belongs in a feature-first, code-first codebase — the base structure map plus per-file rules for modules, services, resolvers (query, mutation, subscription, and field), inputs and args, pagination, Mongoose entities and schema best practices for shared code-first types, model injection confined to repositories, models/mappers, repositories, Mongoose discriminators for polymorphic documents, deriving fields instead of storing duplicated data, providers, loaders, events, background jobs, auth, exceptions, custom scalars, config, common building blocks, GraphQL and database infrastructure, seeds, interfaces/tokens, unions/interfaces and publishing discriminated types, and conventions (naming, barrels/aliases, lint boundaries, test placement, and fixtures) — each with purpose, responsibilities, and incorrect-vs-correct examples. It also covers how modules connect to resolve GraphQL fields and relations, including module-resolution concerns such as circular dependencies, while deferring behavioral concerns to the nestjs-best-practices skill.

---

## Table of Contents

1. [Application Structure](#1-application-structure) — **CRITICAL**
   - 1.1 [Keep Authentication in Its Own Feature Module](#11-keep-authentication-in-its-own-feature-module)
   - 1.2 [Canonical Application Structure](#12-canonical-application-structure)
   - 1.3 [Split a Feature into Sub-Modules When It Grows](#13-split-a-feature-into-sub-modules-when-it-grows)
   - 1.4 [File Placement Table](#14-file-placement-table)
   - 1.5 [Distinguish Domain Features from App-Level Modules](#15-distinguish-domain-features-from-app-level-modules)
   - 1.6 [Locate and Policy the Generated Schema Artifact](#16-locate-and-policy-the-generated-schema-artifact)
2. [Modules & Bootstrap](#2-modules--bootstrap) — **CRITICAL**
   - 2.1 [Keep main.ts and app.module.ts Thin](#21-keep-maints-and-appmodulets-thin)
   - 2.2 [Export Only the Feature's Public API (Its Services)](#22-export-only-the-features-public-api-its-services)
   - 2.3 [The Feature Module File](#23-the-feature-module-file)
3. [Relations & Cross-Module](#3-relations--cross-module) — **CRITICAL**
   - 3.1 [Resolve Circular Module Dependencies](#31-resolve-circular-module-dependencies)
   - 3.2 [Batch Relations with a Per-Request DataLoader](#32-batch-relations-with-a-per-request-dataloader)
   - 3.3 [Decouple Modules with Events](#33-decouple-modules-with-events)
   - 3.4 [Resolve Relations with @ResolveField](#34-resolve-relations-with-resolvefield)
   - 3.5 [Put a Relation Field in the Module That Owns Its Data](#35-put-a-relation-field-in-the-module-that-owns-its-data)
4. [Services](#4-services) — **HIGH**
   - 4.1 [Keep Queue Processors and Scheduled Jobs with the Feature](#41-keep-queue-processors-and-scheduled-jobs-with-the-feature)
   - 4.2 [Keep Third-Party Clients in providers/](#42-keep-third-party-clients-in-providers)
   - 4.3 [Declare Service Contracts and Injection Tokens in interfaces/](#43-declare-service-contracts-and-injection-tokens-in-interfaces)
   - 4.4 [Multiple Focused Services per Module](#44-multiple-focused-services-per-module)
   - 4.5 [Keep Service Methods Small and Focused](#45-keep-service-methods-small-and-focused)
5. [GraphQL Resolvers](#5-graphql-resolvers) — **HIGH**
   - 5.1 [Declare Fields on the Type; Resolve Computed Ones in the Resolver](#51-declare-fields-on-the-type-resolve-computed-ones-in-the-resolver)
   - 5.2 [Split Resolvers by Role into resolvers/](#52-split-resolvers-by-role-into-resolvers)
   - 5.3 [One Resolver File per Type That Has Field Resolvers](#53-one-resolver-file-per-type-that-has-field-resolvers)
   - 5.4 [Put Subscription Resolvers in resolvers/ with PubSub in infra/](#54-put-subscription-resolvers-in-resolvers-with-pubsub-in-infra)
6. [GraphQL Types & Inputs](#6-graphql-types--inputs) — **HIGH**
   - 6.1 [Define @Args Classes in dto/](#61-define-args-classes-in-dto)
   - 6.2 [Define GraphQL Inputs in dto/](#62-define-graphql-inputs-in-dto)
   - 6.3 [Paginate List Queries with a Shared Page Type](#63-paginate-list-queries-with-a-shared-page-type)
   - 6.4 [Publish Discriminated Documents as an Interface or Union](#64-publish-discriminated-documents-as-an-interface-or-union)
   - 6.5 [Place Union and Interface Types with the Module's Types](#65-place-union-and-interface-types-with-the-modules-types)
7. [Data Access](#7-data-access) — **MEDIUM-HIGH**
   - 7.1 [Compute Derived Fields; Do Not Store Them](#71-compute-derived-fields-do-not-store-them)
   - 7.2 [Model Polymorphic Subtypes with Discriminators](#72-model-polymorphic-subtypes-with-discriminators)
   - 7.3 [Place MongoDB Entities in entities/](#73-place-mongodb-entities-in-entities)
   - 7.4 [Inject a Model Only in the Repository](#74-inject-a-model-only-in-the-repository)
   - 7.5 [Split models/ and mappers/ When API Differs From Storage](#75-split-models-and-mappers-when-api-differs-from-storage)
   - 7.6 [Mongoose Schema Best Practices for Shared Types](#76-mongoose-schema-best-practices-for-shared-types)
   - 7.7 [Keep Data Access in repositories/](#77-keep-data-access-in-repositories)
8. [Config, Common & Infra](#8-config-common--infra) — **MEDIUM**
   - 8.1 [Put Shared Types in common/types/](#81-put-shared-types-in-commontypes)
   - 8.2 [Put Shared Building Blocks in common/](#82-put-shared-building-blocks-in-common)
   - 8.3 [Put Typed Configuration in config/](#83-put-typed-configuration-in-config)
   - 8.4 [Implement Custom Scalars in common/scalars/](#84-implement-custom-scalars-in-commonscalars)
   - 8.5 [Put Database Setup and Migrations in infra/database/](#85-put-database-setup-and-migrations-in-infradatabase)
   - 8.6 [Put Schema Directives in common/directives/](#86-put-schema-directives-in-commondirectives)
   - 8.7 [Put Exceptions in exceptions/](#87-put-exceptions-in-exceptions)
   - 8.8 [Put GraphQL Setup in infra/graphql/](#88-put-graphql-setup-in-infragraphql)
   - 8.9 [Put Seed Scripts in infra/database/seeds/](#89-put-seed-scripts-in-infradatabaseseeds)
   - 8.10 [Use a SharedModule for Cross-Cutting Services](#810-use-a-sharedmodule-for-cross-cutting-services)
9. [Conventions & Testing](#9-conventions--testing) — **MEDIUM**
   - 9.1 [Use Barrels and Path Aliases Deliberately](#91-use-barrels-and-path-aliases-deliberately)
   - 9.2 [Use the Nest CLI Generator, Then Adjust](#92-use-the-nest-cli-generator-then-adjust)
   - 9.3 [Keep Constants and Enums Out of Class Files](#93-keep-constants-and-enums-out-of-class-files)
   - 9.4 [Enforce Module Boundaries with Lint](#94-enforce-module-boundaries-with-lint)
   - 9.5 [File and Class Naming Conventions](#95-file-and-class-naming-conventions)
   - 9.6 [Place Test Fixtures, Factories, and Helpers in test/](#96-place-test-fixtures-factories-and-helpers-in-test)
   - 9.7 [Test File Placement](#97-test-file-placement)

---

## 1. Application Structure

**Section Impact: CRITICAL**

### 1.1 Keep Authentication in Its Own Feature Module

**Impact: CRITICAL** — auth is a bounded context with its own strategies and guards

**Purpose.** Authentication and authorization form their own bounded context. Login, token
refresh, and logout operations, token issuance, Passport strategies, and auth-specific services
belong to one `modules/auth/` feature — not scattered into `common/` or bolted onto the users
feature. This keeps the module graph one-directional (auth depends on users; users never depends
on auth) and mirrors the NestJS convention of keeping auth in its own `auth/` folder.

**Placement.** `modules/auth/` with `strategies/`, `services/`, `resolvers/`, `dto/`, and
`auth.module.ts`. Shared, feature-agnostic guards (`JwtAuthGuard`, `RolesGuard`) and decorators
(`@CurrentUser`, `@Public`, `@Roles`) live in `common/guards/` and `common/decorators/` — see
`infra-common`. An auth-owned entity such as a session or refresh token lives in
`modules/auth/entities/`.

**Responsibilities.**

- Own the auth feature's resolvers (login, refresh, logout), services, and Passport strategies.
- Declare a `strategies/` folder holding each Passport strategy (`jwt.strategy.ts`,
  `local.strategy.ts`).
- Import `UsersModule` and inject its exported service; never the reverse.

**Never.**

- Put a Passport strategy in `common/` — a strategy is a provider of a feature, not a shared helper.
- Let `UsersModule` import `AuthModule`; the dependency points auth → users only.
- Scatter `@CurrentUser` / `@Public` / `@Roles` across features — they are shared, so they live in
  `common/`.

**Incorrect (strategy scattered into common/, and users depends on auth):**

```typescript
// common/strategies/jwt.strategy.ts — a Passport strategy is not a shared helper
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) { /* ... */ }

// modules/users/users.module.ts
@Module({ imports: [AuthModule] }) // users now depends on auth — the wrong direction
export class UsersModule {}
```

Why it is wrong: the strategy has no feature owner, and the dependency points the wrong way, so
`AuthModule` can no longer inject `UsersService` without a cycle.

**Correct (auth is its own feature; shared guards and decorators stay in common/):**

```typescript
// modules/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService, // auth depends on users, one way
  ) {
    super({ /* ... */ });
  }

  validate(payload: JwtPayload) {
    return this.usersService.findById(payload.sub);
  }
}

// modules/auth/auth.module.ts
@Module({
  imports: [UsersModule, PassportModule, JwtModule.registerAsync(/* ... */)],
  providers: [AuthService, JwtStrategy, AuthMutationResolver],
  exports: [AuthService],
})
export class AuthModule {}

// common/decorators/public.decorator.ts — shared, so it lives in common/
export const Public = () => SetMetadata('isPublic', true);
```

Why it is right: auth owns its strategies and services, it depends on users one way, and the
guards and decorators every feature needs stay in `common/`.

Reference: [NestJS Authentication](https://docs.nestjs.com/security/authentication) | [NestJS Guards](https://docs.nestjs.com/guards)

**Behavioral depth.** See `nestjs-best-practices` -> `security-auth-jwt`, `security-use-guards`.

---

### 1.2 Canonical Application Structure

**Impact: CRITICAL** — the map every other placement rule hangs from

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

---

### 1.3 Split a Feature into Sub-Modules When It Grows

**Impact: HIGH** — a growing feature decomposes, it does not become a mega-module

**Purpose.** The base map assumes one folder per bounded context. When a feature accumulates several
related-but-distinct concerns — a users feature with separate profile, preferences, and invitations
areas — grow it by decomposition, not by piling more files into one module. Extract a concern into
its own Nest module: nested under the feature while the concern is private to it, promoted to a
sibling `modules/<name>/` once it stands on its own. Every extracted module keeps the same shape
(module + resolvers + services + kind subfolders) and declares its own providers and exports.

**Placement.**

- Nested module (a concern still owned by the feature):
  `modules/<feature>/<submodule>/<submodule>.module.ts`.
- Promoted module (a standalone bounded context): `modules/<name>/<name>.module.ts`.

Default to a sibling module when the concern is genuinely separate; nest only while it is private to
its parent feature.

**Responsibilities.**

- Give each extracted concern its own `<submodule>.module.ts` with its own providers and exports.
- Have the parent feature module import its nested modules and export only its public API.
- Apply the same file-kind subfolders inside the extracted module.

**Never.**

- Grow one module with dozens of unrelated providers and resolvers.
- Extract a concern but leave its providers registered in the parent module.
- Duplicate a concern in both a nested and a sibling module — move it.

**Incorrect (one users module holding every concern):**

```text
modules/users/
  users.module.ts        # registers profile, preferences, invitations, ...
  resolvers/             # 12 resolver files
  services/              # 9 services
  dto/                   # 30 inputs
```

Why it is wrong: every concern shares one module boundary, so the module is a grab-bag and its export
surface, test surface, and provider list all grow without limit.

**Correct (extract a nested module; promote it when it stands alone):**

```typescript
// modules/users/users.module.ts — the feature composes its own concerns
@Module({
  imports: [UserProfileModule, UserPreferencesModule],
  providers: [UsersService, UsersQueryResolver],
  exports: [UsersService],
})
export class UsersModule {}

// modules/users/profile/user-profile.module.ts — an extracted concern, same shape
@Module({
  providers: [UserProfileService, UserProfileResolver, UserProfileRepository],
  exports: [UserProfileService],
})
export class UserProfileModule {}
// promote to modules/profile/ once another feature depends on it
```

Why it is right: each concern has its own module boundary, the parent composes them, and a concern
can be promoted to a sibling module without rewriting its internals.

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS Project Structure (Encore)](https://encore.dev/articles/nestjs-project-structure-best-practices)

---

### 1.4 File Placement Table

**Impact: HIGH** — one lookup answers "where does this file go?"

**Purpose.** A single lookup from file kind to folder. Use it when you know what you are
creating but not where it belongs; the base structure rule (`struct-canonical-layout`) shows the
full tree, and the linked rule gives the file's purpose and examples.

**Placement.** This rule is the index; each row points to the rule that owns the file kind.
`<f>` is the feature's module/folder name, plural (for example `users`); `<entity>` is the
feature's primary domain noun, singular (for example `user`). See `conventions-naming`.

| File kind | Location | Rule |
|-----------|----------|------|
| Feature module | `modules/<f>/<f>.module.ts` | `module-feature-module` |
| Nested sub-module | `modules/<f>/<submodule>/` | `struct-feature-decomposition` |
| App-level module (auth, health) | `modules/<name>/<name>.module.ts` | `struct-module-kinds` |
| Auth feature module | `modules/auth/auth.module.ts` | `struct-auth-feature` |
| Passport strategy | `modules/auth/strategies/<name>.strategy.ts` | `struct-auth-feature` |
| Query resolver | `modules/<f>/resolvers/<f>.query.resolver.ts` | `resolver-organization` |
| Mutation resolver | `modules/<f>/resolvers/<f>.mutation.resolver.ts` | `resolver-organization` |
| Subscription resolver | `modules/<f>/resolvers/<f>.subscription.resolver.ts` | `resolver-subscriptions` |
| Cross-module field resolver | `modules/<f>/resolvers/<type>-<f>.resolver.ts` | `relations-owning-module` |
| Own-type field resolver | `modules/<f>/resolvers/<type>.resolver.ts` | `resolver-per-type` |
| Domain service | `modules/<f>/services/<f>.service.ts` | `service-single-responsibility` |
| Custom repository | `modules/<f>/repositories/<f>.repository.ts` | `data-repository` |
| Third-party provider | `modules/<f>/providers/<vendor>.provider.ts` | `service-external-providers` |
| Queue processor | `modules/<f>/processors/<f>.processor.ts` | `service-background-jobs` |
| Scheduled job | `modules/<f>/jobs/<f>.job.ts` | `service-background-jobs` |
| GraphQL input | `modules/<f>/dto/create-<entity>.input.ts` | `type-inputs` |
| GraphQL args | `modules/<f>/dto/find-<f>.args.ts` | `type-args` |
| Pagination args | `modules/<f>/dto/<f>-pagination.args.ts` | `type-pagination` |
| Constants / enums | `modules/<f>/constants/` | `conventions-constants-enums` |
| Feature-local exception | `modules/<f>/exceptions/<name>.exception.ts` | `infra-exceptions` |
| Feature port / token | `modules/<f>/interfaces/<name>.interface.ts` | `service-interfaces-tokens` |
| Shared port / token | `common/interfaces/<name>.interface.ts` | `service-interfaces-tokens` |
| Persistence entity / object type | `modules/<f>/entities/<entity>.entity.ts` | `data-entity-mongodb` |
| GraphQL-only model (split) | `modules/<f>/models/<entity>.model.ts` | `data-models-mappers` |
| GraphQL union / interface | `modules/<f>/models/<name>.union.ts` | `type-unions-interfaces` |
| Mapper | `modules/<f>/mappers/<entity>.mapper.ts` | `data-models-mappers` |
| DataLoader | `modules/<f>/loaders/<f>.loader.ts` | `relations-dataloader` |
| Domain event / listener | `modules/<f>/events/` | `relations-events` |
| Config namespace | `config/` | `infra-config` |
| Shared guard/filter/interceptor/pipe | `common/` | `infra-common` |
| Custom scalar | `common/scalars/<name>.scalar.ts` | `infra-custom-scalars` |
| Schema directive | `common/directives/<name>.directive.ts` | `infra-directives` |
| Shared type (context, auth user) | `common/types/<name>.ts` | `infra-common-types` |
| Shared/base exception | `common/exceptions/<name>.exception.ts` | `infra-exceptions` |
| Cross-cutting constant / enum | `common/constants/` | `conventions-constants-enums` |
| Shared page types | `common/pagination/` | `type-pagination` |
| Shared service | `common/services/<name>.service.ts` | `infra-shared-module` |
| Shared module | `common/shared.module.ts` | `infra-shared-module` |
| GraphQL setup / context | `infra/graphql/` | `infra-graphql` |
| PubSub provider | `infra/pubsub/` | `resolver-subscriptions` |
| DB setup / migrations | `infra/database/` | `infra-database` |
| Seed script | `infra/database/seeds/<name>.seed.ts` | `infra-seeds` |
| Queue setup | `infra/queue/` | `service-background-jobs` |
| Bootstrap | `main.ts` | `module-bootstrap` |
| Composition root | `app.module.ts` | `module-bootstrap` |
| Generated SDL | path from `autoSchemaFile` | `struct-schema-artifact` |
| Unit test | co-located `<name>.spec.ts` | `conventions-testing` |
| E2E test | `test/<f>.e2e-spec.ts` | `conventions-testing` |
| Test fixture / factory / helper | `test/{fixtures,factories,helpers}/` | `conventions-test-fixtures` |
| Path aliases | `tsconfig.json` `paths` | `conventions-barrels-aliases` |
| Boundary lint config | repo root `eslint.config.js` | `conventions-module-boundaries` |

**Never.**

- Invent a new folder for a file kind that already has a home above.
- Place a file by the feature that first needs it rather than by its role.

Every file kind resolves to exactly one folder here, so placement has a deterministic answer and
the structure stays consistent as the app grows.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

---

### 1.5 Distinguish Domain Features from App-Level Modules

**Impact: HIGH** — modules/ holds bounded contexts plus a few app-level modules

**Purpose.** `modules/` is not only domain features. A real application also has a small number
of app-level modules that expose infrastructure or operational endpoints rather than a business
domain — for example `health/` (liveness/readiness) and `auth/` (authentication, see
`struct-auth-feature`). They live under `modules/` too, in the same shape (module + providers),
so the composition root stays a flat list of modules and every module has one home.

**Placement.** `modules/<name>/<name>.module.ts` for every module, domain or app-level. App-level
examples: `modules/health/`, `modules/auth/`.

**Responsibilities.**

- Keep every module — domain or app-level — in one folder with its own `<name>.module.ts`.
- Keep app-level modules small: one module and a few providers, no business logic.
- Register every module once, in `app.module.ts`.

**Never.**

- Bury an app-level module inside a domain feature (`modules/users/health/`).
- Define an operational endpoint in `main.ts` or `AppModule` directly.
- Give an app-level module a domain dependency it does not need.

**Incorrect (an operational endpoint wired into the composition root):**

```typescript
// app.module.ts — the composition root owns an operational concern
@Module({ providers: [HealthService], controllers: [HealthController] })
export class AppModule {}
```

Why it is wrong: `AppModule` becomes the home for a health endpoint, and that endpoint has no
owner or boundary of its own.

**Correct (app-level module beside the domain features):**

```typescript
// modules/health/health.resolver.ts
@Resolver()
export class HealthResolver {
  @Query(() => String, { name: 'health' })
  health(): string {
    return 'ok';
  }
}

// modules/health/health.module.ts
@Module({ imports: [TerminusModule], providers: [HealthResolver] })
export class HealthModule {}

// app.module.ts — one flat list of modules, domain and app-level alike
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GraphqlInfraModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
```

Why it is right: the operational module has a home next to the domain ones, stays small, and
`app.module.ts` remains a flat list of modules.

Reference: [NestJS Terminus](https://docs.nestjs.com/recipes/terminus) | [NestJS Modules](https://docs.nestjs.com/modules)

---

### 1.6 Locate and Policy the Generated Schema Artifact

**Impact: MEDIUM** — the SDL is generated, not hand-edited

**Purpose.** In code-first GraphQL, the SDL is generated from the decorators according to
`autoSchemaFile`. The generated file has one documented home (commonly `src/schema.gql`) and a
team policy: commit it so schema changes appear in reviewable diffs, or ignore it and
regenerate. Either way it is never hand-edited.

**Placement.** The path set in `autoSchemaFile` in `infra/graphql/graphql.module.ts`.

**Responsibilities.**

- Generate the SDL to a single, documented path.
- Keep one policy: commit the file for reviewable schema diffs, or gitignore it.

**Never.**

- Hand-edit the generated SDL — change the classes instead.
- Generate to multiple paths or commit conflicting copies.
- Generate into ephemeral build output only and lose the schema diff.

**Incorrect (schema file edited by hand):**

```graphql
# src/schema.gql — a field added by hand
type User {
  _id: ID!
  email: String!
  nickname: String   # not backed by any @ObjectType field; lost on next build
}
```

Why it is wrong: the change is invisible to the code that generates the schema and disappears
the next time the app starts.

**Correct (change the class; the SDL regenerates):**

```typescript
@ObjectType()
export class User {
  @Field(() => ID) _id: string;
  @Field() email: string;
  @Field() nickname: string;
}
// schema.gql is regenerated from this at startup/build and reviewed as a diff
```

Why it is right: the schema is derived from the code, the artifact always reflects the code,
and its diff shows exactly what changed in the public API.

Reference: [NestJS GraphQL Quick Start](https://docs.nestjs.com/graphql/quick-start)

---

## 2. Modules & Bootstrap

**Section Impact: CRITICAL**

### 2.1 Keep main.ts and app.module.ts Thin

**Impact: CRITICAL** — bootstrap and composition, nothing else

**Purpose.** `main.ts` creates the application and registers cross-cutting concerns — global
pipes, filters, and interceptors. `app.module.ts` is the composition root: it imports feature
modules and infrastructure modules. Neither contains business logic or feature wiring.

**Placement.** `src/main.ts`, `src/app.module.ts`.

**Responsibilities.**

- `main.ts`: create the app, register global pipes/filters/interceptors, enable shutdown hooks,
  listen.
- `app.module.ts`: import config, infrastructure, and feature modules.

`AppModule` lists **modules**, not individual providers. The one documented exception is app-wide
enhancer registrations that the framework requires as providers — `APP_GUARD`, `APP_PIPE`,
`APP_FILTER`, and `APP_INTERCEPTOR` (see `nestjs-best-practices` -> `security-use-guards`).

**Never.**

- Register a feature's providers in `AppModule`.
- Put domain logic in `main.ts`.
- List individual providers rather than importing the modules that own them.

**Incorrect (logic in bootstrap, feature internals in AppModule):**

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const user = await app.get(UsersService).findById('1'); // domain work in bootstrap
  app.listen(3000);
}

// app.module.ts — lists every provider of every feature
@Module({ providers: [UsersService, OrdersService, UsersRepository] })
export class AppModule {}
```

Why it is wrong: `main.ts` does work that belongs to a service, and `AppModule` knows feature
internals it should never see.

**Correct (bootstrap and composition only):**

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GraphqlInfraModule,
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
```

Why it is right: `main.ts` only bootstraps and registers global concerns; `AppModule` lists
modules, not providers, so each feature stays encapsulated.

Reference: [NestJS First Steps](https://docs.nestjs.com/first-steps) | [NestJS Modules](https://docs.nestjs.com/modules)

---

### 2.2 Export Only the Feature's Public API (Its Services)

**Impact: HIGH** — one narrow entry point; internals stay private

**Purpose.** A module's `exports` array is the feature's public API. In practice that is the
feature's **service(s)** — the entry point other modules inject — plus any module it deliberately
re-exports. Everything else the feature owns stays private. A wide export surface couples other
features to your internals and makes change expensive.

**Placement.** The `exports` array of `modules/<feature>/<feature>.module.ts`.

**Responsibilities.**

- Export the service(s) other modules need to inject.
- Re-export an imported module when you deliberately want to share its providers.
- Keep the export list as small as the feature's public API allows.

**Never.**

- Export a **repository** — data access stays behind the service.
- Export a **resolver** — it is an entry point, not a dependency others inject.
- Export an **entity, model, or input** — these are TypeScript types; import them directly, do
  not route them through a module's `exports`.
- Export a **loader** — a consumer that needs batching declares its own loader over the injected
  service (see `relations-dataloader`).

Guards are not published through `exports` either: a guard is a class you import directly and
attach with `@UseGuards(...)`, or register globally with `APP_GUARD`.

**Incorrect (the whole feature is public):**

```typescript
// modules/users/users.module.ts
@Module({
  providers: [UsersService, UsersRepository, UsersQueryResolver, UsersLoader],
  exports: [UsersService, UsersRepository, UsersQueryResolver, UsersLoader], // all internals
})
export class UsersModule {}
```

Why it is wrong: other modules can now depend on the repository, the resolver, and the loader —
none of those can change without breaking consumers, and the module has no private area.

**Correct (one public entry point):**

```typescript
// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService, UsersRepository, UsersQueryResolver, UserPreferencesResolver],
  exports: [UsersService], // the feature's public API
})
export class UsersModule {}

// A consumer imports the module and injects only the service
@Module({ imports: [UsersModule] })
export class OrdersModule {}

@Injectable()
export class OrdersService {
  constructor(private readonly usersService: UsersService) {} // the one allowed dependency
}
```

Why it is right: consumers see exactly one dependency (`UsersService`); the repository, resolvers,
and other internals can change freely; and a provider is shared by re-exporting a module rather
than widening the export list.

Reference: [NestJS Modules — Shared modules](https://docs.nestjs.com/modules#shared-modules) | [NestJS Modules — Re-exporting](https://docs.nestjs.com/modules#module-re-exporting)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-module-sharing`.

---

### 2.3 The Feature Module File

**Impact: CRITICAL** — a module declares its own providers and exports

**Purpose.** `<feature>.module.ts` wires a feature together: it declares the feature's
providers (resolvers, services, repositories), imports what those providers need, and exports
the small set of providers other modules may inject. The module is the feature's public
interface.

**Placement.** `modules/<feature>/<feature>.module.ts`. Class name `<Feature>Module`.

**Responsibilities.**

- List resolvers, services, and repositories in `providers`.
- Import the modules whose exported providers this feature injects (for example
  `MongooseModule.forFeature([...])` or another feature module).
- Export only the providers other modules need.
- Register feature-local listeners, guards, and other providers.

`AppModule` composes features by listing their **modules**, not their individual providers. The one
documented exception is app-wide enhancer registrations the framework requires as providers —
`APP_GUARD`, `APP_PIPE`, `APP_FILTER`, and `APP_INTERCEPTOR` (see `nestjs-best-practices` ->
`security-use-guards`).

**Never.**

- Register feature providers in `AppModule` directly.
- Export everything by default.
- Put business logic or configuration in the module class.

**Incorrect (the module wires other features, exports internals, and holds logic):**

```typescript
// modules/users/users.module.ts
@Module({
  providers: [
    UsersService,
    UsersRepository,
    OrdersService, // belongs to OrdersModule
    AuthService,   // belongs to AuthModule
  ],
  exports: [UsersRepository, UsersQueryResolver], // internals and a resolver, exported
})
export class UsersModule {
  onModuleInit() {
    // module-level wiring or domain logic that belongs in a provider
  }
}
```

Why it is wrong: the feature module reaches into other features, exposes its internals, and carries
logic — so it no longer describes one feature's public interface.

**Correct (feature wires itself, minimal exports):**

```typescript
// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [
    UsersService,
    UsersProfileService,
    UsersRepository,
    UsersQueryResolver,
    UsersMutationResolver,
  ],
  exports: [UsersService], // only what other modules inject
})
export class UsersModule {}

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GraphqlInfraModule,
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
```

Why it is right: the feature owns its wiring, exposes a minimal interface, and `AppModule`
only lists features and infrastructure.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-feature-modules` and `arch-module-sharing`.

---

## 3. Relations & Cross-Module

**Section Impact: CRITICAL**

### 3.1 Resolve Circular Module Dependencies

**Impact: CRITICAL** — a cycle is an architecture bug, not a wiring problem

**Purpose.** A circular dependency is when module A imports module B and B imports A, directly
or transitively. It is an architecture problem: the two modules are really one, or the shared
piece belongs in a third module. Fix the structure first; `forwardRef` is a last resort that
hides the cycle rather than removing it. Relation fields rarely cause cycles, because the module
that owns the data owns the field (see `relations-owning-module`).

**Placement.** The fix is structural — extract a shared module, invert the dependency with
events, or depend on a service contract.

**Responsibilities.**

- Model the module graph as a directed acyclic graph (no cycles).
- Extract genuinely shared logic into its own module that both sides import.
- Break behavioural cycles with events or a token-provided contract.

**Never.**

- Reach for `forwardRef` as the first answer.
- Merge two features into one large module just to silence the warning.
- Resolve providers through `ModuleRef` to dodge the error.

**Incorrect (two modules importing each other):**

```typescript
// orders.module.ts
@Module({ imports: [UsersModule], providers: [OrdersService] })
export class OrdersModule {}

// users.module.ts
@Module({ imports: [OrdersModule], providers: [UsersService] })
export class UsersModule {}
```

Why it is wrong: the two modules cannot be reasoned about or tested separately, and the cycle
usually exists because each needs one small thing the other owns.

**Correct (extract the shared dependency, or invert with events):**

```typescript
// shared/profile.module.ts — the thing both actually need
@Module({ providers: [ProfileService], exports: [ProfileService] })
export class ProfileModule {}

// orders.module.ts
@Module({ imports: [ProfileModule], providers: [OrdersService] })
export class OrdersModule {}

// users.module.ts
@Module({ imports: [ProfileModule], providers: [UsersService] })
export class UsersModule {}

// When one module only needs to *react* to the other, use an event instead of importing it:
// users emits 'user.created'; orders listens with @OnEvent('user.created').
```

Why it is right: the shared concern moves to a module both sides import without cycling, and
one-directional reactions use events, so the module graph stays acyclic.

`forwardRef(() => X)` is acceptable only as a documented last resort — when neither a shared
module nor events are possible — and the cycle should be recorded as debt to remove.

Reference: [NestJS Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-avoid-circular-deps`.

---

### 3.2 Batch Relations with a Per-Request DataLoader

**Impact: CRITICAL** — eliminates N+1 on relational fields

**Purpose.** A field resolver runs once per parent, so a naive implementation issues one query
per parent — the N+1 problem. A `DataLoader` batches those per-parent loads within a single
tick into one query and memoizes them for the request. Loaders live in the feature's `loaders/`
folder and are created per request as request-scoped providers.

**Placement.** `modules/<feature>/loaders/<feature>.loader.ts`, provided request-scoped by the
module that declares the field — the module that owns the data — and injected into the field
resolvers that use it; it batches that module's own service.

**Responsibilities.**

- Define a `DataLoader` keyed on the parent id.
- Batch the keys into one repository/service call.
- Return results in the same order as the input keys.
- Be instantiated once per request, never as an application singleton.

**Never.**

- Hold a `DataLoader` as a singleton — its cache would leak data across requests.
- Issue a query per parent inside a field resolver.
- Ignore the ordering contract; `DataLoader` requires results in input-key order.

**Incorrect (singleton loader that still issues N queries):**

```typescript
@Injectable()
export class OrdersLoader {
  readonly byUser = new DataLoader(async (userIds) =>
    Promise.all(userIds.map((id) => this.ordersService.findByUser(id))), // still N queries
  );
}
```

Why it is wrong: as a singleton, one request's cached data can be served to another, and the
batch function still issues one query per key, so N+1 is not solved.

**Correct (request-scoped loader provider, injected where used):**

```typescript
// loaders/orders.loader.ts — one instance per request
@Injectable({ scope: Scope.REQUEST })
export class OrdersLoader {
  constructor(private readonly ordersService: OrdersService) {}

  // The batch function itself — group keys, return results in input-key order —
  // is a performance concern covered by nestjs-best-practices -> db-avoid-n-plus-one.
  private readonly byUser = new DataLoader<string, Order[]>((userIds) =>
    this.ordersService.findByUserIds([...userIds]),
  );

  loadByUserId(id: string): Promise<Order[]> {
    return this.byUser.load(id);
  }
}
```

Why it is right: the loader lives in `loaders/`, is request-scoped so its cache never crosses
requests, and is injected into the field resolver that needs it. The batching/grouping
implementation itself is owned by `db-avoid-n-plus-one`.

Reference: [graphql/dataloader](https://github.com/graphql/dataloader)

**Behavioral depth.** See `nestjs-best-practices` -> `db-avoid-n-plus-one` for the batch function itself.

---

### 3.3 Decouple Modules with Events

**Impact: HIGH** — react without importing

**Purpose.** When one module should react to something another module did — send a welcome
email after a user is created — without importing it, emit an event from the actor and listen
in the reactor. Event payloads and listeners live in the feature's `events/` folder. This keeps
the dependency one-directional and stops the actor's constructor from growing with every new
reaction.

**Placement.** `modules/<feature>/events/<feature>-<action>.event.ts` (payload class) and
`<feature>-<action>.listener.ts` (the `@OnEvent` handler, in the reacting module).

**Responsibilities.**

- Define the event payload as an explicit class.
- Emit with `EventEmitter2` from the service that performs the action.
- Register listeners in the reacting module.

**Never.**

- Use an event when a return value is needed — that is a request/response call; use the owning
  service instead.
- Emit from a resolver; emit from the service that owns the state change.
- Import the reacting module just so the actor can call it.

**Incorrect (the actor imports and calls every reactor):**

```typescript
@Injectable()
export class UsersService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.usersRepository.create(input);
    await this.notifications.sendWelcome(user); // actor knows every reactor
    await this.analytics.trackSignup(user);
    await this.audit.record('user.created', user);
    return user;
  }
}
```

Why it is wrong: every new reaction edits the users service, and the service depends on modules
it should not know about.

**Correct (emit once, react independently):**

```typescript
// events/user-created.event.ts
export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}

// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.usersRepository.create(input);
    this.events.emit('user.created', new UserCreatedEvent(user._id.toString(), user.email));
    return user;
  }
}

// events/user-created.listener.ts (in the notifications module)
@Injectable()
export class UserCreatedListener {
  @OnEvent('user.created')
  async handle(event: UserCreatedEvent): Promise<void> {
    await this.notifications.sendWelcome(event.email);
  }
}
```

Why it is right: the users service emits and moves on, and each new reaction is a new listener
that never touches the actor.

For a synchronous cross-module dependency where a value is needed, inject the owning module's
exported service instead (see `module-export-policy`).

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-events`.

---

### 3.4 Resolve Relations with @ResolveField

**Impact: CRITICAL** — resolve relations on demand, not eagerly

**Purpose.** A relation exposed on a type — a field pointing to other objects — is resolved with an
`@ResolveField` method, on demand, only when the client requests it. Never eager-load relations in
the parent query. This rule covers the mechanic; *which file* the resolver lives in is decided by
`resolver-per-type` (the type's own module) or `relations-owning-module` (another module's type).

**Placement.** The file belongs to the type it resolves: `<type>.resolver.ts` in that type's own
module (see `resolver-per-type`), or the extending module's file when it extends another module's
type (see `relations-owning-module`). The method name matches the GraphQL field.

**Responsibilities.**

- Declare `@Resolver(() => OwnerType)` for the type the fields belong to.
- Read the parent key with `@Parent()`.
- Delegate to the owning module's own service or loader (see `relations-dataloader`).

**Never.**

- Eager-load relations in the query resolver.
- Query once per parent inside the field resolver (that is N+1 — see `relations-dataloader`).
- Reach into another module's repository, entity, or model.

**Incorrect (relations eager-loaded in the parent query):**

```typescript
// orders/resolvers/orders.query.resolver.ts
@Query(() => Order)
async order(@Args('id') id: string) {
  return this.orderModel.findById(id).populate(['items', 'items.product']); // loads all, asked or not
}
```

Why it is wrong: the query does work the client did not request and pays for it on every call.

**Correct (same-module relation resolved on demand and batched):**

```typescript
// orders/resolvers/order.resolver.ts — Order and OrderItem are both owned by OrdersModule
@Resolver(() => Order)
export class OrderResolver {
  constructor(private readonly orderItemsLoader: OrderItemsLoader) {}

  @ResolveField(() => [OrderItem])
  items(@Parent() order: Order): Promise<OrderItem[]> {
    return this.orderItemsLoader.loadByOrderId(order._id.toString());
  }
}
```

Why it is right: the field is resolved only when asked, from the parent already in hand, by the
module that owns order items.

For a type with several field resolvers, keep them all in its one per-type file — see
`resolver-per-type`.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

**Behavioral depth.** See `nestjs-best-practices` -> `db-avoid-n-plus-one`.

---

### 3.5 Put a Relation Field in the Module That Owns Its Data

**Impact: CRITICAL** — one-directional module dependencies; no forwardRef

When a type from module A needs a field whose data comes from module B, the field is **not**
added in A. It is added in **B**, as an extension resolver on A's type (`@Resolver(() => A)` +
`@ResolveField`), using B's own service. B imports A's type class (and A's module only if it also
injects A's service); A never imports B. The module that owns the extra data owns the field, so
module and service dependencies stay one-directional and no cycle or `forwardRef` is ever needed —
even though the GraphQL types reference each other in both directions.

**Placement.** `<data-owner>/resolvers/<type>-<feature>.resolver.ts` (for example
`comments/resolvers/user-comments.resolver.ts`). The same file belongs to the data owner, never to
the type's own module.

**Responsibilities.**

- Put the resolver in the module that owns the data the field returns.
- Declare it `@Resolver(() => OtherType)` with a `@ResolveField(() => FieldType)` method.
- Read the parent key from `@Parent()` and call the module's **own** service.
- Keep every dependency pointing data-owner → type-owner.

**Never.**

- Add the relation field inside the type's own module when that requires importing the module that
  owns the data.
- Import the data-owner module from the type-owner module.
- Reach into another module's repository, entity, or model.
- Use `forwardRef` to make a relation field resolve.

Decision question: *I need field X on type T — where does the data come from? Put the resolver in
that module.*

**Incorrect (the type's own module declares and resolves `User.comments`):**

```typescript
// users/resolvers/user-comments.resolver.ts   <-- belongs in comments/, not users/
@Resolver(() => User)
export class UserCommentsResolver {
  constructor(private readonly commentsService: CommentsService) {} // users now imports comments
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user._id.toString());
  }
}
// A cycle appears the moment CommentsModule needs anything from UsersModule.
```

Why it is wrong: the type's own module now depends on the data owner, so the dependency direction
is reversed and a cycle is only a matter of time.

**Correct (the data owner owns the field; the same resolver lives in the correct module):**

```typescript
// comments/resolvers/user-comments.resolver.ts
@Resolver(() => User)                                   // the User type class, imported
export class UserCommentsResolver {
  constructor(private readonly commentsService: CommentsService) {} // its own service
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user._id.toString());
  }
}
// CommentsModule imports the User class (and UsersModule only if it injects UsersService).
// UsersModule knows nothing about comments. Dependencies point one way -> no cycle, no forwardRef.
```

Why it is right: the file lives with the data it returns, the resolver uses that module's own
service, and every dependency still points one way, so no cycle or `forwardRef` is needed.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency)

---

## 4. Services

**Section Impact: HIGH**

### 4.1 Keep Queue Processors and Scheduled Jobs with the Feature

**Impact: MEDIUM-HIGH** — producers in services, consumers in the owning feature

**Purpose.** Long-running or scheduled work runs outside the request: enqueue a job from the
service that owns the action, and process it in the feature that owns the data the job touches.
The queue connection is one-time infrastructure in `infra/queue/`; the processors and scheduled
jobs are feature-local providers, because they inject the feature's own services. This keeps the
producer/consumer split clean and the processors unit-testable.

**Placement.**

- Queue connection/registration: `src/infra/queue/queue.module.ts`.
- Queue processor: `modules/<feature>/processors/<feature>.processor.ts` (class `<Feature>Processor`).
- Scheduled/cron job: `modules/<feature>/jobs/<feature>.job.ts` (class `<Feature>Job`).
- Producer: a method on the feature's service (it holds the queue handle).

**Responsibilities.**

- Register the queue connection once, in `infra/queue/`.
- Enqueue from the service that owns the state change.
- Process in the feature that owns the affected data, injecting that feature's services.

**Never.**

- Do long-running work inline in a resolver or on the request path.
- Process a feature's jobs from an unrelated module or from `infra/`.
- Register the queue connection per feature.

**Incorrect (a minutes-long job inline in the request):**

```typescript
// modules/reports/resolvers/reports.mutation.resolver.ts
@Mutation(() => Report)
async generateReport(@Args('input') input: ReportInput) {
  const data = await this.fetchHugeDataset(input); // blocks the request for minutes
  return this.buildReport(data);
}
```

Why it is wrong: a minutes-long task blocks the request, and there is no retry, tracking, or
isolation.

**Correct (enqueue from the service, process in the owning feature):**

```typescript
// services/reports.service.ts — producer
@Injectable()
export class ReportsService {
  constructor(@InjectQueue('reports') private readonly reportsQueue: Queue) {}

  async requestReport(input: ReportInput): Promise<{ jobId: string }> {
    const job = await this.reportsQueue.add('generate', input);
    return { jobId: job.id };
  }
}

// modules/reports/processors/reports.processor.ts — consumer in the owning feature
@Processor('reports')
export class ReportsProcessor {
  constructor(private readonly reportsService: ReportsService) {}

  @Process('generate')
  async generate(job: Job<ReportInput>): Promise<void> {
    await this.reportsService.buildReport(job.data);
  }
}
```

Why it is right: the request returns immediately with a job id, the consumer lives with the data
it touches, and the connection is configured once in `infra/queue/`.

Reference: [NestJS Queues](https://docs.nestjs.com/techniques/queues) | [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)

**Behavioral depth.** See `nestjs-best-practices` -> `micro-use-queues`.

---

### 4.2 Keep Third-Party Clients in providers/

**Impact: MEDIUM-HIGH** — vendor SDKs are wrapped behind a thin, injectable provider

**Purpose.** A feature that talks to an external system — a payment gateway, object storage, a
mailer, an SMS or analytics API — wraps that vendor SDK in a thin provider. Providers live in the
feature's `providers/` folder, next to the services that use them, so the vendor's types and error
shapes stay at the edge and the feature's services depend on a narrow, mockable wrapper. Business
logic stays in `services/`; the provider only translates.

**Placement.** `modules/<feature>/providers/<vendor>.provider.ts` (class `<Vendor>Provider`).
Configuration is read from `config/` (see `infra-config`), never hardcoded.

**Responsibilities.**

- Wrap one external system per file, exposing intention-revealing methods.
- Translate vendor errors into domain errors (see `infra-exceptions`).
- Be injectable so tests can substitute a fake.

**Never.**

- Call a vendor SDK directly from a service or resolver.
- Leak a vendor-specific type or error shape into the feature's services' contract.
- Hardcode credentials or endpoints — read typed config.

**Incorrect (vendor SDK called directly from business logic):**

```typescript
// services/payments.service.ts
@Injectable()
export class PaymentsService {
  async charge(order: Order) {
    const stripe = new Stripe(process.env.STRIPE_KEY); // SDK + secret inside the service
    const res = await stripe.paymentIntents.create({ /* ... */ }); // vendor shapes leak inward
    return res.id;
  }
}
```

Why it is wrong: the vendor SDK and its error shapes leak into business logic, the secret is read
ad hoc, and the service cannot be tested without the vendor.

**Correct (a thin provider wraps the vendor; the service depends on it):**

```typescript
// modules/payments/providers/stripe.provider.ts
@Injectable()
export class StripeProvider {
  private readonly stripe: Stripe;

  constructor(config: ConfigService) {
    this.stripe = new Stripe(config.get<string>('payment.stripeKey'));
  }

  async charge(amount: number, currency: string): Promise<{ id: string }> {
    const intent = await this.stripe.paymentIntents.create({ amount, currency });
    return { id: intent.id };
  }
}

// services/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(private readonly stripe: StripeProvider) {}

  async charge(order: Order): Promise<void> {
    await this.stripe.charge(order.total, order.currency);
  }
}
```

Why it is right: the vendor stays at the edge, the service depends on a narrow provider that is
trivial to mock, and the secret comes from typed config.

Reference: [NestJS Providers](https://docs.nestjs.com/providers) | [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)

---

### 4.3 Declare Service Contracts and Injection Tokens in interfaces/

**Impact: MEDIUM-HIGH** — depend on a contract, provide the implementation

**Purpose.** When a consumer should depend on a contract rather than a concrete class — a payment
gateway, a mailer, a storage adapter — declare an interface (or abstract class) and its injection
token in an `interfaces/` folder, then let the module provide the implementation. The contract and
its token live together: feature-local in `modules/<feature>/interfaces/`, or shared in
`common/interfaces/`. Consumers inject by token; the module chooses which implementation to bind.

**Placement.**

- Feature-local contract: `modules/<feature>/interfaces/<name>.interface.ts` (interface or abstract
  class and its `Symbol` token in the same file).
- Shared contract: `common/interfaces/<name>.interface.ts`.

**Responsibilities.**

- Export the interface and its token from one file.
- Provide an implementation for the token in the owning module's `providers`.
- Let consumers inject the token, not the concrete class.

**Never.**

- Inject a concrete class when a contract exists — that defeats substitution.
- Keep a token in a different file from its interface, so the two drift.
- Declare a contract in a feature that another feature also needs — promote it to `common/interfaces/`.

**Incorrect (the consumer depends on the concrete implementation):**

```typescript
// modules/payments/services/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(private readonly stripe: StripeProvider) {} // welded to one implementation
}
```

Why it is wrong: the service cannot be pointed at a different implementation or a test double without
editing it.

**Correct (contract + token in interfaces/, implementation provided by the module):**

```typescript
// modules/payments/interfaces/payment-gateway.interface.ts
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentGateway {
  charge(amount: number, currency: string): Promise<{ id: string }>;
}

// modules/payments/payments.module.ts — the module chooses the implementation
@Module({
  providers: [
    { provide: PAYMENT_GATEWAY, useClass: StripeProvider },
    PaymentsService,
  ],
})
export class PaymentsModule {}

// modules/payments/services/payments.service.ts — depends on the contract
@Injectable()
export class PaymentsService {
  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}
}
```

Why it is right: the service depends on a contract whose implementation the module supplies, so it is
trivially substitutable for another vendor or a test double.

Reference: [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) | [NestJS Modules](https://docs.nestjs.com/modules)

**Behavioral depth.** See `nestjs-best-practices` -> `di-use-interfaces-tokens`, `di-interface-segregation`.

---

### 4.4 Multiple Focused Services per Module

**Impact: HIGH** — split by responsibility; a module usually has several services

**Purpose.** A module's business logic lives in its `services/` folder. A feature almost
always has more than one responsibility, so it should have more than one service. Each
service owns a single concern, which keeps files small, easy to test, and safe to change
without dragging in the rest of the feature.

**Placement.** `modules/<feature>/services/<feature>.service.ts`, plus
`<feature>-<concern>.service.ts` for each additional concern. Name the class after the
concern: `UsersService`, `UsersProfileService`, `UsersInvitationsService`.

**Responsibilities.**

- Expose the operations that resolvers and other modules need.
- Own the business rules for exactly one concern.
- Depend on repositories and other services through constructor injection.

**Never.**

- Contain GraphQL decorators (`@Query`, `@Resolver`) or HTTP/Express objects.
- Reach directly into the ORM/model — that is the repository's job.
- Mix unrelated concerns into one class because they share a name prefix.

**Incorrect (one god service):**

```typescript
// modules/users/services/users.service.ts — one class, five concerns
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly uploads: UploadService,
    private readonly reports: ReportService,
  ) {}

  findById(id: string) { /* user queries */ }
  login(email: string, password: string) { /* auth */ }
  uploadAvatar(id: string, file: Buffer) { /* media */ }
  sendPasswordReset(email: string) { /* notifications */ }
  buildActivityReport(id: string) { /* reporting */ }
}
```

Why it is wrong: every new concern grows the same class, its constructor pulls in half the
application, and testing any one behavior means mocking all five dependencies.

**Correct (focused services):**

```typescript
// modules/users/services/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new UserNotFoundException(id);
    return user;
  }
}

// modules/users/services/users-profile.service.ts
@Injectable()
export class UsersProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async updateProfile(id: string, input: UpdateUserInput): Promise<User> {
    return this.usersRepository.update(id, input);
  }
}
```

Why it is right: each service has one reason to change and one dependency set; the module
registers them side by side and each resolver depends only on the service it needs.

Reference: [NestJS Providers](https://docs.nestjs.com/providers)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-single-responsibility`.

---

### 4.5 Keep Service Methods Small and Focused

**Impact: HIGH** — easier to read, test, and change

**Purpose.** A service method should do one thing at one level of abstraction. A method that
validates, queries, maps, charges, and notifies is hard to read, hard to test, and changes for
many reasons. Extract each step into a private method, and move a genuinely separate concern into
its own service.

**Placement.** Within the feature's `services/` files.

**Responsibilities.**

- Keep one purpose per method; the public method orchestrates, private helpers do the steps.
- Keep each method at a single level of abstraction.
- Move a separate concern into another service (see `service-single-responsibility`).

**Never.**

- Write one method that performs several unrelated operations.
- Nest conditionals many levels deep or build a long sequential script in one method.
- Mix validation, persistence, mapping, and side effects in one block.

Heuristic: if you cannot describe a method without saying "and", it is more than one method. As a
rough guide, a method that runs past ~40 lines, nests more than ~3 levels, or needs scrolling to
read should be split.

**Incorrect (one long method doing everything):**

```typescript
@Injectable()
export class OrdersService {
  async createOrder(input: CreateOrderInput): Promise<Order> {
    // validate
    if (!input.items.length) throw new BadRequestException('empty');
    for (const item of input.items) {
      if (item.qty <= 0) throw new BadRequestException('bad qty');
    }
    // price
    let total = 0;
    for (const item of input.items) {
      const product = await this.productRepo.findById(item.productId);
      total += product.price * item.qty;
    }
    // discount
    if (input.coupon) {
      const coupon = await this.couponRepo.findByCode(input.coupon);
      if (coupon && coupon.expiresAt > new Date()) total *= 1 - coupon.rate;
    }
    // persist
    const order = await this.orderRepo.save({ ...input, total });
    // notify
    await this.mailer.send(order.customerEmail, 'Order placed');
    this.events.emit('order.created', order);
    return order;
  }
}
```

Why it is wrong: five concerns in one method, so pricing cannot be tested without the database,
the mailer, and the event bus.

**Correct (public method orchestrates, distinct concerns delegated):**

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly pricing: OrdersPricingService,
    private readonly ordersRepository: OrdersRepository,
    private readonly events: EventEmitter2,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    this.validate(input);
    const total = await this.pricing.calculateTotal(input.items, input.coupon);
    const order = await this.ordersRepository.create({ ...input, total });
    this.events.emit('order.created', new OrderCreatedEvent(order._id.toString(), order.customerEmail));
    return order;
  }

  private validate(input: CreateOrderInput): void {
    if (!input.items.length) throw new BadRequestException('empty order');
    if (input.items.some((i) => i.qty <= 0)) throw new BadRequestException('invalid quantity');
  }
}

// services/orders-pricing.service.ts — its own concern, testable on its own
@Injectable()
export class OrdersPricingService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly couponsRepository: CouponsRepository,
  ) {}

  async calculateTotal(items: OrderItem[], couponCode?: string): Promise<number> {
    const subtotal = await this.subtotal(items);
    return couponCode ? this.applyCoupon(subtotal, couponCode) : subtotal;
  }

  // ...private subtotal() / applyCoupon() helpers
}
```

Why it is right: each method does one thing, the public method reads as a short story, and pricing
is a separate service you can test without the database or the mailer.

Reference: [NestJS Providers](https://docs.nestjs.com/providers) | [Single Responsibility Principle](https://en.wikipedia.org/wiki/Single-responsibility_principle)

---

## 5. GraphQL Resolvers

**Section Impact: HIGH**

### 5.1 Declare Fields on the Type; Resolve Computed Ones in the Resolver

**Impact: HIGH** — one source of truth per field

**Purpose.** In code-first GraphQL a field exists in the schema only because it is declared with
`@Field()` on the `@ObjectType`. A `@ResolveField` supplies the field's **value**; it does not
declare the field. So every exposed field is declared once with `@Field()`, and how its value is
produced depends on the field:

- **Plain field** — the value is on the object. Declare `@Field()`, populate it, add **no**
  `@ResolveField`.
- **Computed / resolved field** — declare `@Field()` on the class as type-only (never populated),
  and implement it with exactly one `@ResolveField` in the type's `<type>.resolver.ts`
  (see `resolver-per-type`).

**Responsibilities.**

- Declare each exposed field exactly once, with `@Field()`, on the `@ObjectType`.
- Leave a computed field's class property undeclared in the data (use `!`, e.g.
  `onboardingComplete!: boolean`) and never assign it.
- Give each computed field one `@ResolveField` and nothing else.

**Never.**

- Declare a field with `@ResolveField` but no `@Field` — it will not appear in the schema (Nest
  warns "ResolveField … identified as defined in the resolver but not in the schema").
- Add a `@ResolveField` for a plain field — it is redundant and hides which fields are stored.
- Populate a field on the object *and* resolve it with `@ResolveField` — two sources of truth; the
  resolver silently wins and the stored value is ignored.
- Assign a computed property in a mapper or service as well as resolving it.
- Assume "one `@ResolveField` per field" means "in the type's own module": when the computed field's
  source data belongs to another module, the single resolver lives in that data-owner module (see
  `relations-owning-module`).

**Incorrect (computed field has no declaration, or two sources of truth):**

```typescript
// entities/user-preferences.entity.ts
@ObjectType()
export class UserPreferences {
  @Field() timezone: string;
  @Field() onboardingComplete?: boolean; // ALSO populated from the DB...
}

// resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  @ResolveField(() => Boolean)           // ...and resolved here
  onboardingComplete(@Parent() prefs: UserPreferences) {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
// A field with only @ResolveField and no @Field would not be in the schema at all.
```

Why it is wrong: `onboardingComplete` has two sources (the stored value and the resolver), so the
stored value is ignored; a resolver-only field would never be exposed.

**Correct (declared once; computed resolved in the per-type resolver):**

```typescript
// entities/user-preferences.entity.ts
@ObjectType()
export class UserPreferences {
  @Field() timezone: string;                 // plain: value on the object

  @Field(() => Boolean)
  onboardingComplete!: boolean;              // computed: type-only, never populated
}

// resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @ResolveField(() => Boolean)
  onboardingComplete(@Parent() prefs: UserPreferences): Promise<boolean> {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
```

Why it is right: the schema field is declared exactly once; its value has exactly one source; and
plain fields carry no resolver, so the presence of a resolver marks a computed field.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 5.2 Split Resolvers by Role into resolvers/

**Impact: HIGH** — thin, role-focused entry points

**Purpose.** Entry-point resolvers (`@Query`, `@Mutation`) live in the feature's `resolvers/`
folder, split by role so each file stays small and the module's provider list stays readable. An
entry-point resolver targets one type and one role, stays thin, and delegates to services. Field
resolvers are a separate concern, living in their own per-type file (see `resolver-per-type` and
`relations-owning-module`) — not here.

**Placement.** `modules/<feature>/resolvers/<feature>.query.resolver.ts` and
`<feature>.mutation.resolver.ts`. Entry-point resolvers always split by role; keep a role file
only for the operations that role actually has.

**Responsibilities.**

- Declare `@Query()` and `@Mutation()` methods for one parent type.
- Translate arguments into service calls and return the result.
- Declare the parent type with `@Resolver(() => Feature)`.

**Never.**

- Contain business logic or direct model/repository access.
- Catch and reformat errors by hand — use exception filters.
- Hold `@ResolveField()` methods — they belong in the type's per-type resolver file (see
  `resolver-per-type`).
- Name an entry-point resolver `<type>.resolver.ts` — that filename belongs to a type's field
  resolvers (see `resolver-per-type`).
- Register in `AppModule`; resolvers are providers of their own feature module.

**Incorrect (one class for everything, logic inline):**

```typescript
// resolvers/app.resolver.ts
@Resolver()
export class AppResolver {
  @Query(() => User)
  async user(@Args('id') id: string) {
    const user = await this.userModel.findById(id); // data access here
    if (!user) throw new Error('not found');
    user.lastSeen = new Date();
    await user.save();                               // business logic here
    return user;
  }

  @Mutation(() => User)
  async updateUser(@Args('id') id: string, @Args('name') name: string) {
    /* more of the same */
  }
}
```

Why it is wrong: one file owns every type and mixes layers.

**Correct (role-split, thin resolvers):**

```typescript
// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User, { name: 'user' })
  async getUser(@Args('id', ParseObjectIdPipe) id: string): Promise<User> {
    return this.usersService.findById(id);
  }
}

// modules/users/resolvers/users.mutation.resolver.ts
@Resolver(() => User)
export class UsersMutationResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation(() => User, { name: 'updateUser' })
  async updateUser(@Args('input') input: UpdateUserInput): Promise<User> {
    return this.usersService.update(input);
  }
}
```

Why it is right: each file is one type and one role, and resolvers only translate and delegate.
A type's field resolvers live together in one per-type file (see `resolver-per-type`).

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 5.3 One Resolver File per Type That Has Field Resolvers

**Impact: HIGH** — the resolver file is the registry of a type's resolved fields

**Purpose.** Some fields on an `@ObjectType` cannot be read from the stored object — a nested value
object's computed fields (`UserPreferences.darkMode`), or a field derived elsewhere. Each needs an
`@ResolveField`. GraphQL never records which fields have resolvers, so the code must: a type that
has any field resolver gets **one** resolver file, and that file contains all of them. The file's
presence is the signal that the type has resolved fields; a type with no such file has only plain
fields.

**Placement.** `modules/<owner>/resolvers/<type>.resolver.ts`, where `<owner>` is the module that
owns the type and `<type>` is the kebab name of the type being resolved — for example
`users/resolvers/user-preferences.resolver.ts` for the `UserPreferences` type. Class name
`<Type>Resolver`.

**Responsibilities.**

- Declare each resolved field on the `@ObjectType` with `@Field()` **as well as** implementing it
  with `@ResolveField` — the resolver supplies the field's value but does not add it to the
  schema (see `resolver-computed-fields`).
- Declare `@Resolver(() => TheType)` and one `@ResolveField` per resolved field.
- Make the method name equal the GraphQL field name.
- Hold **every** field resolver whose data this module owns for that type.
- A field backed by another module's data is resolved in that module, not here; ownership, not the
  filename, decides where the resolver lives (see `relations-owning-module`).

**Never.**

- Split a type's field resolvers across several files.
- Create a resolver file for a type whose fields are all plain (it needs none).
- Put query or mutation resolvers here — those belong to the top-level type's resolver.

**Incorrect (a type's resolved fields are spread out, so which are resolved is unclear):**

```typescript
// users/resolvers/users.query.resolver.ts — one UserPreferences field resolver buried with queries
@Resolver(() => UserPreferences)
export class UsersQueryResolver {
  @ResolveField(() => String)
  greeting(@Parent() prefs: UserPreferences) { /* ... */ }
}
// users/resolvers/user-preferences.extra.resolver.ts — another UserPreferences resolver elsewhere
// Result: nothing tells a reader which UserPreferences fields are resolved.
```

Why it is wrong: to learn which fields of `UserPreferences` have custom resolvers you must search
the whole module.

**Correct (one registry file for the type):**

```typescript
// users/resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @ResolveField(() => String)
  greeting(@Parent() prefs: UserPreferences): string {
    return this.preferencesService.greeting(prefs.locale);
  }

  @ResolveField(() => Boolean)
  onboardingComplete(@Parent() prefs: UserPreferences): Promise<boolean> {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
```

Why it is right: every `@ResolveField` for `UserPreferences` lives in one file; its existence says
the type has resolved fields, and opening it lists exactly which.

This is a same-module ("nested") resolver. When a field is backed by data another module owns, the
file lives in that module instead — see `relations-owning-module`. The module a resolver lives in
is what distinguishes a nested field from a cross-module relation.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 5.4 Put Subscription Resolvers in resolvers/ with PubSub in infra/

**Impact: HIGH** — one place for real-time entry points and the PubSub provider

**Purpose.** A GraphQL subscription is a third resolver role alongside query and mutation.
Subscription resolvers live in the feature's `resolvers/` folder, named by role, and stay thin —
they subscribe to a topic and map the payload. The `PubSub` engine they use is one-time
infrastructure: a single provider in `infra/pubsub/`, swapping the in-memory engine for a Redis
one in production.

**Placement.**

- Subscription resolver: `modules/<feature>/resolvers/<feature>.subscription.resolver.ts`
  (class `<Feature>SubscriptionResolver`).
- PubSub provider: `src/infra/pubsub/pubsub.providers.ts`.
- WebSocket/subscription transport option: `infra/graphql/graphql.module.ts` (the `subscriptions`
  config).

**Responsibilities.**

- Declare `@Subscription(() => Type)` methods that subscribe to a named topic.
- Emit to the same topic from the owning service (see `relations-events` for the emit-side pattern).
- Provide one `PubSub` instance in `infra/pubsub/`, injected where needed.

**Never.**

- Emit events from a subscription resolver — emit from the service that owns the state change.
- Create a `new PubSub()` per resolver or per feature; it is one shared provider.
- Put a subscription resolver in `common/` or inside a service.

**Incorrect (a PubSub instance per feature, topic emitted from the resolver):**

```typescript
// modules/orders/resolvers/orders.subscription.resolver.ts
const pubSub = new PubSub(); // a second instance — events never reach other instances

@Subscription(() => Order)
orderCreated() {
  pubSub.publish('order.created', { orderCreated: {} }); // emitting from the resolver
  return pubSub.asyncIterableIterator('order.created');
}
```

Why it is wrong: each `new PubSub()` is isolated, so the subscription may never receive the event,
and the resolver emits instead of the service that changed the state.

**Correct (one shared PubSub in infra/, thin subscription resolver):**

```typescript
// infra/pubsub/pubsub.providers.ts
export const PUB_SUB = 'PUB_SUB';
export const pubSubProvider: Provider = {
  provide: PUB_SUB,
  useValue: new PubSub(), // swap this one provider for a Redis-backed PubSub in production
};

// modules/orders/resolvers/orders.subscription.resolver.ts
@Resolver(() => Order)
export class OrdersSubscriptionResolver {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  @Subscription(() => Order, { name: 'orderCreated' })
  orderCreated() {
    return this.pubSub.asyncIterableIterator('order.created');
  }
}

// modules/orders/services/orders.service.ts — the state owner emits
this.pubSub.publish('order.created', { orderCreated: order });
```

Why it is right: one PubSub instance is shared across the app, the resolver only subscribes, and
the state-owning service emits.

Reference: [NestJS GraphQL Subscriptions](https://docs.nestjs.com/graphql/subscriptions) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-events`.

---

## 6. GraphQL Types & Inputs

**Section Impact: HIGH**

### 6.1 Define @Args Classes in dto/

**Impact: HIGH** — group and validate operation arguments

**Purpose.** When an operation takes more than one or two arguments, or the arguments form a
logical group (pagination, filters, sorting), define an `@ArgsType()` class in the feature's
`dto/` folder instead of a list of raw `@Args('x')` scalars. It groups and validates the
arguments the same way `@InputType` does for inputs.

**Placement.** `modules/<feature>/dto/find-<feature>.args.ts`. Class names end in `Args`.

**Responsibilities.**

- Group related arguments on one `@ArgsType()` class.
- Validate each field with `class-validator`.
- Supply sensible defaults (for example page or limit).

**Never.**

- Scatter many raw `@Args('field')` scalars across a resolver.
- Accept unvalidated filter or sort strings straight from the client.
- Reuse an `@InputType` class as an args type (or vice versa) just to avoid a file.

**Incorrect (raw, unvalidated arguments):**

```typescript
@Query(() => [User])
users(
  @Args('search') search: string,
  @Args('page') page: number,
  @Args('limit') limit: number,
  @Args('sort') sort: string,
) {
  // every argument raw and unvalidated, defaults are ad hoc
  return this.usersService.findAll({ search, page, limit, sort });
}
```

Why it is wrong: argument handling is repeated in every resolver, nothing is validated, and
paging defaults are handled per call site.

**Correct (one validated args type, defaults included):**

```typescript
// dto/find-users.args.ts
@ArgsType()
export class FindUsersArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString() @MaxLength(100)
  search?: string;

  @Field(() => Int, { defaultValue: 1 })
  @Type(() => Number)
  @IsInt() @Min(1)
  page = 1;

  @Field(() => Int, { defaultValue: 20 })
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limit = 20;
}

@Query(() => [User])
users(@Args() args: FindUsersArgs) {
  return this.usersService.findAll(args);
}
```

Why it is right: the argument group is one validated, reusable, named type with sensible
defaults, and the resolver stays a one-line translation.

For a list query that can grow, prefer cursor arguments (`first`/`after`) — see `type-pagination`.
The `page`/`limit` shape above is the offset alternative, kept for small, bounded lists.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 6.2 Define GraphQL Inputs in dto/

**Impact: HIGH** — validated inputs are the API boundary

**Purpose.** Mutation and query inputs are declared as code-first `@InputType()` classes and
live in the feature's `dto/` folder. They are the boundary where untrusted input is validated
and shaped, so they must carry validation and must never expose internal fields.

**Placement.** `modules/<feature>/dto/create-<entity>.input.ts`,
`update-<entity>.input.ts`. Class names end in `Input`.

**Responsibilities.**

- Declare exactly the fields the operation accepts, with `@Field()`.
- Validate each field with `class-validator`.
- Derive variants with mapped types (`PartialType`, `OmitType`, `PickType`).

**Never.**

- Reuse a persistence entity as an input.
- Accept sensitive or internal fields (`passwordHash`, `roles`) on self-service inputs.
- Skip validation and trust the client.

**Incorrect (entity reused, no validation, internal fields exposed):**

```typescript
// dto/user.input.ts
@InputType()
export class UserInput {
  @Field({ nullable: true }) email?: string;
  @Field({ nullable: true }) passwordHash?: string; // client can set the hash
  @Field({ nullable: true }) roles?: string[];      // privilege escalation
}

@Query(() => User)
user(@Args('email') email: string) { /* raw scalar, nothing validated */ }
```

Why it is wrong: nothing is validated, the client can set fields it must not control, and
there is no distinct shape for create versus update.

**Correct (validated input type, derived variants):**

```typescript
// dto/create-user.input.ts
@InputType()
export class CreateUserInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString() @MinLength(8) @MaxLength(72)
  password: string;

  @Field()
  @IsString() @MaxLength(100)
  name: string;
}

// dto/update-user.input.ts — derived, never hand-duplicated
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}
```

Why it is right: the accepted shape is explicit and validated per field, and update/read
variants are derived, so they cannot drift from the create shape.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS Mapped Types](https://docs.nestjs.com/graphql/mapped-types)

---

### 6.3 Paginate List Queries with a Shared Page Type

**Impact: HIGH** — one cursor-connection pattern for every list

**Purpose.** Every list query needs pagination. GraphQL's recommended pattern is cursor-based
pagination ("connections"): a `first`/`after` args type plus an edge/node/`pageInfo` result type.
Define the shared building blocks once in `common/pagination/` — a generic `Paginated<T>` factory
and a `PageInfo` type — and reuse them for every list; keep a feature's own args and filter types
in its `dto/`. `PageInfo` follows the Relay Cursor Connections spec: nullable `startCursor`/`endCursor`
and required `hasPreviousPage`/`hasNextPage`. A `totalCount` field is an **optional, non-Relay
extension** — include it only when it can be computed cheaply. For a small, bounded, non-growing
admin list offset (`page`/`limit`) is acceptable; pick one per query and do not mix the two.

**Placement.**

- Shared: `src/common/pagination/paginated.ts` (the generic `Paginated<T>` factory and
  `PageInfo`).
- Feature args/filters: `modules/<feature>/dto/<feature>-pagination.args.ts`,
  `filter-<feature>.input.ts`.

**Responsibilities.**

- Define the generic `Paginated<T>` connection factory once, in `common/pagination/`.
- Give each list query an `@ArgsType()` with `first`/`after` (and filters) in the feature's `dto/`.
- Return a `Paginated<T>` from the query and build it from the service result.
- Include `totalCount` only when it is cheap to compute — it is an optional, non-Relay extension.

**Never.**

- Return a bare `[Item]` array from a list query that can grow.
- Re-implement an edge/`pageInfo` type per feature — import the shared factory.
- Mix offset (`page`/`limit`) and cursor (`first`/`after`) on the same query.

**Incorrect (bare array, unbounded and unpaged):**

```typescript
@Query(() => [User])
users() {
  return this.usersService.findAll(); // grows without limit, no way to page
}
```

Why it is wrong: the list is unbounded and the client has no cursor or page to move through it.

**Correct (shared connection factory, feature args, paged result):**

```typescript
// common/pagination/paginated.ts — defined once for the whole app
@ObjectType('PageInfo')
export class PageInfo {
  @Field(() => String, { nullable: true })
  startCursor?: string;

  @Field(() => String, { nullable: true })
  endCursor?: string;

  @Field()
  hasPreviousPage: boolean;

  @Field()
  hasNextPage: boolean;
}

export function Paginated<T>(classRef: Type<T>) {
  @ObjectType(`${classRef.name}Edge`)
  abstract class EdgeType {
    @Field(() => String)
    cursor: string;

    @Field(() => classRef)
    node: T;
  }

  @ObjectType({ isAbstract: true })
  abstract class PaginatedType {
    @Field(() => [EdgeType])
    edges: EdgeType[];

    @Field(() => PageInfo)
    pageInfo: PageInfo;

    // OPTIONAL, non-Relay extension: include only when totalCount is cheap to compute.
    @Field(() => Int, { nullable: true })
    totalCount?: number;
  }

  return PaginatedType;
}

// modules/users/models/user.model.ts — one connection type per list item
@ObjectType()
export class UserConnection extends Paginated(User) {}

// modules/users/dto/users-pagination.args.ts
@ArgsType()
export class UsersPaginationArgs {
  @Field(() => Int, { defaultValue: 20 })
  @IsInt() @Min(1) @Max(100)
  first = 20;

  @Field({ nullable: true })
  @IsOptional() @IsString()
  after?: string;

  @Field({ nullable: true })
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;
}

// modules/users/resolvers/users.query.resolver.ts
@Query(() => UserConnection)
users(@Args() args: UsersPaginationArgs): Promise<UserConnection> {
  return this.usersService.search(args);
}
```

Why it is right: one cursor-connection shape is defined once and reused, the args and filters live
with the feature that owns them, and every list query pages the same way.

When to use offset instead: a small, bounded, non-growing list where `page`/`limit` is simpler.
Choose per query and stay consistent within it; see `type-args` for the offset-style args shape.

Reference: [GraphQL Pagination](https://graphql.org/learn/pagination/) | [Relay Cursor Connections](https://relay.dev/graphql/connections.htm) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 6.4 Publish Discriminated Documents as an Interface or Union

**Impact: HIGH** — resolveType maps the discriminator key to the concrete type

**Purpose.** A collection that stores several document shapes (Mongoose discriminators, see
`data-discriminators`) is polymorphic in the database and should be polymorphic in the schema: one
abstract GraphQL type — an `@InterfaceType` or a `createUnionType` — whose concrete type is chosen
**automatically** from the document's discriminator key. Implement `resolveType` once, reading the
key (`__t` or your `discriminatorKey`), and map it to the concrete `@ObjectType`. Every resolver
that returns the abstract type then publishes the correct subtype with no per-resolver branching.

**Placement.** The abstract type in `modules/<feature>/models/<name>.interface.ts` or
`<name>.union.ts` (see `type-unions-interfaces`); the concrete `@ObjectType`s in `entities/`
(merged case) or `models/`; a single registry mapping each discriminator value to its type.

**Responsibilities.**

- Declare the base as the abstract type and the subtypes as `@ObjectType`s — an interface requires
  `@ObjectType({ implements: () => [Base] })` on each concrete type.
- Implement exactly one `resolveType` that reads the discriminator key and returns the concrete
  class (or its name).
- Keep the discriminator value -> type mapping in one shared registry, used by both the interface
  and any union over the same types.
- Expose the discriminator key as a GraphQL enum field so clients can branch without inline
  fragments when that is cheaper.

**Never.**

- Guess the type from field presence (`if (value.name) …`) when a discriminator key exists.
- Re-implement `resolveType` in more than one place, or inline in a resolver.
- Return plain object literals that lose the class identity the default `resolveType` relies on.

**Incorrect (shape heuristics, repeated per resolver):**

```typescript
// modules/events/resolvers/events.query.resolver.ts
const EventResult = createUnionType({
  name: 'EventResult',
  types: () => [ClickedLinkEvent, SignUpEvent] as const,
  resolveType: (value) => (value.url ? ClickedLinkEvent : SignUpEvent), // heuristic, duplicated
});

@Query(() => [EventResult])
events() { /* ... */ }
```

Why it is wrong: the type is decided by guessing at field presence rather than the discriminator
key the database already stored, so an ambiguous document resolves to the wrong type — and the same
guess gets repeated wherever events are returned.

**Correct (one interface, one registry, key-driven resolveType):**

```typescript
// constants/event-kind.ts — the discriminator values, shared by storage and schema
export enum EventKind {
  ClickedLink = 'ClickedLink',
  SignUp = 'signup',
}
registerEnumType(EventKind, { name: 'EventKind' });

// models/event-types.ts — the one registry: discriminator value -> concrete ObjectType
export const EVENT_TYPES = {
  [EventKind.ClickedLink]: ClickedLinkEvent,
  [EventKind.SignUp]: SignUpEvent,
} as const;

// entities/event.entity.ts — the base is the GraphQL interface AND the Mongoose base schema
@InterfaceType({
  resolveType: (event: EventDocument) => EVENT_TYPES[event.kind],
})
@Schema({ discriminatorKey: 'kind', collection: 'events' })
export abstract class Event {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => EventKind)
  @Prop({ type: String, required: true, enum: EventKind })
  kind: EventKind;

  @Field()
  @Prop({ type: Date, required: true })
  time: Date;
}

// entities/clicked-link-event.entity.ts — a concrete type implements the interface
@ObjectType({ implements: () => [Event] })
@Schema()
export class ClickedLinkEvent extends Event {
  @Field()
  @Prop({ type: String, required: true })
  url: string;
}

// Any resolver returning the base type needs no branching:
@Query(() => [Event])
events(): Promise<EventDocument[]> {
  return this.eventsService.findAll();
}
```

Why it is right: `resolveType` reads the stored discriminator key and returns the concrete type, so
any resolver that returns `Event` publishes the right subtype automatically, and the mapping lives
in one registry.

In the merged case the base class carries BOTH `@Schema({...})` and `@InterfaceType(...)` — storage
and the GraphQL type on one class — and a subtype that is not published polymorphically is a plain
`@ObjectType()`/`@Schema()` entity (see `data-discriminators`).

**Union variant (same registry, no interface needed):**

```typescript
// models/event-result.union.ts
export const EventResult = createUnionType({
  name: 'EventResult',
  types: () => [ClickedLinkEvent, SignUpEvent] as const,
  resolveType: (event: EventDocument) => EVENT_TYPES[event.kind], // the same one registry
});
```

Use an interface when the types share fields clients query in common; use a union when they do not.
Either way the concrete type comes from the discriminator key, not from a guess.

Reference: [NestJS GraphQL Interfaces](https://docs.nestjs.com/graphql/interfaces) | [NestJS GraphQL Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums) | [Mongoose Discriminators](https://mongoosejs.com/docs/discriminators.html)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-schema-evolution`.

---

### 6.5 Place Union and Interface Types with the Module's Types

**Impact: MEDIUM-HIGH** — polymorphic types have one home and one resolveType

**Purpose.** Abstract GraphQL types — interfaces and unions — are declared in code-first NestJS
with `@InterfaceType()` or `createUnionType()`. They are GraphQL-only types, so they live with the
module's other GraphQL types (`models/` in the split case, or `entities/` in the merged case), and
their `resolveType` is implemented in one place. They are not put in `common/` and not re-declared
per resolver.

**Placement.** `modules/<feature>/models/<name>.interface.ts` and `models/<name>.union.ts` (or the
module's type folder in the merged case). The `resolveType` implementation lives with the type —
in `models/` for the union/interface, or in `resolvers/<name>.resolver.ts` when it needs a service.

**Responsibilities.**

- Declare each interface or union once, in the module that owns the types it groups.
- Implement `resolveType` centrally, in one place.
- Keep the concrete `@ObjectType`s in the same module.

**Never.**

- Declare a union or interface inline inside a query resolver.
- Put a feature's union or interface in `common/` — that couples `common/` to a feature.
- Re-implement `resolveType` in more than one place.

**Incorrect (union declared inline, resolveType scattered):**

```typescript
// modules/search/resolvers/search.query.resolver.ts
const SearchResult = createUnionType({ name: 'SearchResult', types: () => [User, Post] });

@Query(() => [SearchResult])
search() { /* ... */ }
// resolveType handled ad hoc in several resolvers
```

Why it is wrong: the union has no stable home, so it is rebuilt wherever it is needed and the
`resolveType` logic drifts.

**Correct (declared once with the module's types, resolved in one place):**

```typescript
// modules/search/models/search-result.union.ts
export const SearchResult = createUnionType({
  name: 'SearchResult',
  types: () => [User, Post] as const,
  resolveType: (value) => (value.kind === 'user' ? User : Post),
});

// modules/search/models/searchable.interface.ts
@InterfaceType({ resolveType: (value) => (value.kind === 'user' ? User : Post) })
export abstract class Searchable {
  @Field(() => ID)
  id: string;
}

// modules/search/resolvers/search.query.resolver.ts — just uses it
@Query(() => [SearchResult])
search(@Args() args: SearchArgs): Promise<SearchResult[]> {
  return this.searchService.search(args);
}
```

Why it is right: the polymorphic type has one home and one `resolveType`, and the concrete types
sit beside it in the same module.

Reference: [NestJS GraphQL Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums) | [NestJS GraphQL Interfaces](https://docs.nestjs.com/graphql/interfaces)

---

## 7. Data Access

**Section Impact: MEDIUM-HIGH**

### 7.1 Compute Derived Fields; Do Not Store Them

**Impact: MEDIUM-HIGH** — no duplicated or derivable data in the database

**Purpose.** Do not persist what can be derived: totals, counts, a "full name", a status computed
from other fields, and whole sub-objects already stored elsewhere. Storing a derived value creates a
second source of truth, so every write path must remember to keep the copy in sync and the copies
drift. Keep the source on the document and derive the value where it is read — a resolver
(`@ResolveField`) or an aggregation for a field exposed on the `@ObjectType`, or a Mongoose virtual.
A field exposed on the `@ObjectType` is declared type-only and produced by exactly one
`@ResolveField` (or an aggregation); a mapper converts the stored fields and must **never** populate
a field that has a resolver — a derived value a mapper produces is only for internal, non-`@Field`
use. Persist a derived value only as a deliberate materialised cache you own the recomputation of.

**Placement.** Source fields live on the entity (`entities/`). An exposed derived field is produced
in a resolver (`resolvers/<type>.resolver.ts`, see `resolver-computed-fields`) or an aggregation, or
as a Mongoose virtual on the schema; a mapper (`mappers/`, see `data-models-mappers`) converts the
stored fields only and never populates a field that has a resolver.

**Responsibilities.**

- Store the minimal source data; derive everything else at read time.
- Resolve a derived field with `@ResolveField` (declared type-only on the `@ObjectType`) or as a
  virtual — never as an extra `@Prop`.
- Never let a mapper populate a field that has a `@ResolveField` — a value a mapper produces is only
  for internal, non-`@Field` use (see `data-models-mappers`).
- Embed a sub-document only when the parent owns it; **reference** data owned elsewhere instead of
  copying it.
- If a value is materialised for performance, treat it as a cache: recompute it on every write (or
  a periodic job) and document that it is not the source of truth.

**Never.**

- Store a total, count, full name, or status that can be computed from other fields on the same
  document.
- Copy a related sub-object (an author's name or avatar) into every document that references it when
  a `ref` and one owner give the same data.
- Keep two fields that must always agree (a `name` and a denormalised `displayName`) with no single
  writer.
- `populate()` eagerly on every read to reconstruct what you duplicated.

**Incorrect (counts, totals, and a copied name stored as if they were truth):**

```typescript
@Schema()
@ObjectType()
export class Order {
  @Field(() => [OrderItem])
  @Prop({ type: [OrderItemSchema] })
  items: OrderItem[];

  @Field(() => Int)
  @Prop()
  itemCount: number;   // always equals items.length -> a second source of truth

  @Field(() => Float)
  @Prop()
  total: number;       // recomputed by hand on every write; drifts
}

@Schema()
export class Comment {
  @Prop({ type: Types.ObjectId, ref: User.name })
  authorId: Types.ObjectId;

  @Prop()
  authorName: string;  // duplicate of User.name; stale the moment the user renames
}
```

Why it is wrong: `itemCount` and `total` must be recomputed on every mutation and silently drift,
and `authorName` is a copy that goes stale on rename — both duplicate a source of truth.

**Correct (one stored source; derive on read; reference what you do not own):**

```typescript
// entities/order.entity.ts — the only stored source
@Schema()
export class Order {
  @Prop({ type: [OrderItemSchema] })
  items: OrderItem[];
}

// models/order.model.ts — derived fields are declared, never stored
@ObjectType()
export class OrderModel {
  @Field(() => [OrderItem]) items: OrderItem[];

  @Field(() => Int)
  itemCount!: number;   // computed

  @Field(() => Float)
  total!: number;       // computed
}

// resolvers/order.resolver.ts — resolved on demand
@Resolver(() => OrderModel)
export class OrderResolver {
  @ResolveField(() => Int)
  itemCount(@Parent() order: OrderModel): number {
    return order.items.length;
  }

  @ResolveField(() => Float)
  total(@Parent() order: OrderModel): number {
    return order.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  }
}

// entities/comment.entity.ts — reference the owner instead of copying it
@Schema()
export class Comment {
  @Prop({ type: Types.ObjectId, ref: User.name })
  authorId: Types.ObjectId;
  // authorName is resolved from the referenced user, not stored here
}
```

Why it is right: each value has exactly one stored source, derived fields are computed on read, and
the comment references the user instead of copying a name that can change.

**Deliberate exception — the materialised cache.** When a derived value is read far more often than
written and computing it is expensive (a large aggregate), persist it as a computed value and
recompute it on every write or a periodic job — and record that it is a cache. That is MongoDB's
Computed Values pattern; it is a conscious trade, not the default.

Reference: [MongoDB Data Modeling Best Practices](https://www.mongodb.com/docs/manual/data-modeling/best-practices/) | [MongoDB Computed Values Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/computed-values/)

**Behavioral depth.** See `nestjs-best-practices` -> `db-avoid-n-plus-one` (batch or aggregate derived values rather than issuing a query per parent).

---

### 7.2 Model Polymorphic Subtypes with Discriminators

**Impact: MEDIUM-HIGH** — one collection, many shapes, one base model

**Purpose.** When several document shapes share a base and belong together — different user roles,
different event kinds — store them in one collection with Mongoose **discriminators**: a base
schema plus a discriminator schema per subtype, differentiated by the discriminator key (default
`__t`, overridable with `discriminatorKey`). Register them through NestJS so each subtype is its
own injectable model, all backed by the base collection. The GraphQL side of the same feature is
`type-polymorphic-discriminators`.

**Placement.** Base and subtype entities in `modules/<feature>/entities/`; registration in the
feature module's `MongooseModule.forFeature`.

**Responsibilities.**

- Give the base schema a `discriminatorKey` (`@Schema({ discriminatorKey: 'kind' })`) and declare
  the key field with the `enum` of subtype names.
- Declare each subtype as a class that extends the base entity, adding only its extra fields.
- Register each subtype under `discriminators: [{ name, schema, value? }]`; `value` defaults to the
  model name, so set it explicitly when the stored key should differ.
- Inject a subtype's model with `@InjectModel(Subtype.name)` **in the repository** (see
  `data-model-injection`).
- Query the base model to read every subtype, or a discriminator model to read one.

**Never.**

- Use separate collections when the shapes share a base and are queried together — that repeats the
  common fields and loses the shared query (see `type-polymorphic-discriminators`).
- Let a client set the discriminator key directly; the model that creates the document owns it.
- Call `pre()`/`post()` hooks **after** defining a discriminator — declare hooks on the schema
  before it is used as a discriminator.

**Incorrect (separate schemas that repeat the shared fields, queried apart):**

```typescript
// three unrelated collections; common fields duplicated, no shared query
@Schema() export class ClickedLinkEvent { @Prop() time: Date; @Prop() url: string; }
@Schema() export class SignUpEvent { @Prop() time: Date; @Prop() user: string; }
// no base model, no discriminator key, no way to read "all events" in one query
```

Why it is wrong: the shared `time` field is repeated, the two shapes cannot be queried together, and
shared validation has to be copied into each schema.

**Correct (base + subtypes + registration; each subtype is injectable):**

```typescript
// entities/event.entity.ts — the shared base (persistence only)
@Schema({ discriminatorKey: 'kind', timestamps: true, collection: 'events' })
export class Event {
  @Prop({ type: String, required: true, enum: EventKind })
  kind: EventKind;

  @Prop({ type: Date, required: true })
  time: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);

// entities/clicked-link-event.entity.ts — a subtype (persistence only)
@Schema()
export class ClickedLinkEvent extends Event {
  @Prop({ type: String, required: true })
  url: string;
}

export const ClickedLinkEventSchema = SchemaFactory.createForClass(ClickedLinkEvent);

// events.module.ts — register the base plus its discriminators
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Event.name,
        schema: EventSchema,
        discriminators: [
          { name: ClickedLinkEvent.name, schema: ClickedLinkEventSchema },
          { name: SignUpEvent.name, schema: SignUpEventSchema, value: 'signup' },
        ],
      },
    ]),
  ],
  providers: [EventsRepository, EventsService, EventsQueryResolver],
})
export class EventsModule {}
```

```typescript
// repositories/events.repository.ts — subtype models are injected here, nowhere else
@Injectable()
export class EventsRepository {
  constructor(
    @InjectModel(Event.name) private readonly eventModel: Model<EventDocument>,
    @InjectModel(ClickedLinkEvent.name)
    private readonly clickedModel: Model<ClickedLinkEventDocument>,
  ) {}

  findAll(): Promise<EventDocument[]> {
    return this.eventModel.find().exec();     // every subtype, from the base model
  }

  findClicked(): Promise<ClickedLinkEventDocument[]> {
    return this.clickedModel.find().exec();   // one subtype
  }
}
```

Why it is right: one collection holds every shape, the shared base is written once, each subtype has
its own injectable model used only in the repository, and the base model reads all events in one
query.

When the feature publishes these polymorphically, the base class additionally carries
`@InterfaceType({ resolveType })` and each subtype `@ObjectType({ implements: () => [Base] })`, so the
base model is the polymorphic GraphQL type and the concrete type is chosen from the stored
discriminator key automatically — see `type-polymorphic-discriminators`.

Reference: [NestJS MongoDB — Discriminators](https://docs.nestjs.com/techniques/mongodb) | [Mongoose Discriminators](https://mongoosejs.com/docs/discriminators.html)

---

### 7.3 Place MongoDB Entities in entities/

**Impact: MEDIUM-HIGH** — one class per stored document, exposed only where safe

**Purpose.** A MongoDB document lives in the owning feature's `entities/` folder. In the
default (merged) case the same class is both the persistence schema and the GraphQL
`@ObjectType`, which keeps the two in sync for simple, one-to-one domain objects.

**Placement.** `modules/<feature>/entities/<entity>.entity.ts`. One entity per file; the
file and class are named after the singular concept (`user.entity.ts` / class `User`).

**Responsibilities.**

- Define the document shape with `@Schema` and `@Prop`.
- Expose only safe fields to GraphQL with `@Field()`.
- Declare indexes on unique and frequently queried fields.
- Export the `SchemaFactory`-built schema.

**Never.**

- Live in a global `src/entities/` technical folder.
- Put `@Field()` on secrets (password hashes, tokens) — persist them, do not expose them.
- Let the merged class grow until the API shape and the stored shape diverge. That is the
  signal to split into `models/` + `mappers/` (see `data-models-mappers`).

**Incorrect (global folder, secrets exposed, no index):**

```typescript
// src/entities/user.entity.ts — outside its feature
@ObjectType()
@Schema()
export class User {
  @Field() email: string;
  @Field() passwordHash: string;   // exposed in the schema
  @Field() resetToken: string;     // exposed in the schema
  // no unique index on email -> full collection scans, duplicates allowed
}
```

Why it is wrong: the entity escapes its feature, and fields that must never leave the server
become part of the public graph.

**Correct (feature-local, safe exposure, indexed):**

```typescript
// modules/users/entities/user.entity.ts
export type UserDocument = HydratedDocument<User>;

@ObjectType()
@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true, select: false }) // persisted, NOT a @Field
  passwordHash: string;

  @Prop({ select: false })                 // persisted, NOT a @Field
  resetToken?: string;

  @Field()
  @Prop({ required: true })
  name: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
```

Why it is right: the document lives with its feature, only safe fields reach the schema, and
the lookup column is indexed so queries do not scan the whole collection.

When the API shape stops matching storage — computed fields, relation-only fields, or secrets
that need a different exposure — keep the entity persistence-only and move the exposed type
to `models/` with a `mappers/` file. See `data-models-mappers`.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 7.4 Inject a Model Only in the Repository

**Impact: HIGH** — the model token stops at the data layer

**Purpose.** A NestJS Mongoose model (`Model<Doc>`) is obtained with `@InjectModel(...)`. That
injection marks the boundary of the data layer: **only the repository receives the model**.
Resolvers depend on services; services depend on repositories; repositories depend on the model.
Nothing above the repository knows a Mongoose model exists, so the ORM never leaks into business
logic, GraphQL types, or tests. This is the injection-side counterpart to `data-repository`.

**Placement.** `@InjectModel` is written once per entity, in
`modules/<feature>/repositories/<feature>.repository.ts`. The module makes the model available by
importing `MongooseModule.forFeature([{ name: X.name, schema: XSchema }])`.

**Responsibilities.**

- Inject the model exactly once per entity, in the repository constructor, as `private readonly`.
- Express every read and write as a repository method with a domain signature.
- Keep the model instance private to the repository — never return it or accept it as a parameter.
- Have services inject the repository, and resolvers inject the service.

**Never.**

- Inject a model into a **service**, **resolver**, **loader**, or **provider** — inject the
  repository instead.
- Let `Model<...>`, a query builder, or an aggregation type appear in a service or resolver
  signature.
- Register the model in `AppModule` or export it from the module — the repository encapsulates it.

**Incorrect (the service injects the model and builds the query):**

```typescript
// services/users.service.ts — reaches straight through to Mongoose
@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async findActive(): Promise<UserDocument[]> {
    return this.userModel.find({ isActive: true }).exec(); // ORM detail in business code
  }
}
```

Why it is wrong: the model token escapes the data layer, so business code owns query detail, the
service is welded to Mongoose, and the query cannot be stubbed without a real model.

**Correct (model -> repository -> service -> resolver, one direction):**

```typescript
// repositories/users.repository.ts — the only place the model exists
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findActive(): Promise<UserDocument[]> {
    return this.userModel.find({ isActive: true }).exec();
  }
}

// services/users.service.ts — depends on the repository, not the model
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findActive(): Promise<UserDocument[]> {
    return this.usersRepository.findActive();
  }
}

// resolvers/users.query.resolver.ts — depends on the service
@Query(() => [User])
findActiveUsers(): Promise<UserDocument[]> {
  return this.usersService.findActive();
}

// users.module.ts — the model provider and the repository live together
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersRepository, UsersService, UsersQueryResolver],
  exports: [UsersService],
})
export class UsersModule {}
```

Why it is right: the model is injected in exactly one place, the dependency chain flows
model -> repository -> service -> resolver, and any layer above the repository can be tested with a
stubbed repository.

Discriminator subtypes follow the same rule — inject each subtype's model in the repository; see
`data-discriminators`.

Reference: [NestJS MongoDB — Model injection](https://docs.nestjs.com/techniques/mongodb#model-injection) | [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-repository-pattern`.

---

### 7.5 Split models/ and mappers/ When API Differs From Storage

**Impact: MEDIUM-HIGH** — keep the public graph decoupled from the database

**Purpose.** By default a MongoDB entity doubles as its GraphQL `@ObjectType` (see
`data-entity-mongodb`). When the exposed shape stops matching the stored shape — computed fields,
relation-only fields, or fields that need different exposure — split them: keep the entity
persistence-only in `entities/`, put the GraphQL `@ObjectType` in `models/`, and convert between
them in `mappers/`.

**Placement.**

- `modules/<feature>/entities/<entity>.entity.ts` — persistence only (keep `@Schema`/`@Prop`,
  drop `@ObjectType`/`@Field`).
- `modules/<feature>/models/<entity>.model.ts` — the GraphQL `@ObjectType`.
- `modules/<feature>/mappers/<entity>.mapper.ts` — entity → model.

`models/` is not exclusive to the split case: it holds GraphQL-only `@ObjectType`s and is also where
GraphQL-only types such as pagination connection types live (see `type-pagination`) — even when the
entity itself stays merged with its `@ObjectType`.

**Responsibilities.**

- Model: exactly the fields the API exposes.
- Mapper: a pure conversion from entity to model of the *stored* fields (plus the id); computed
  fields are resolved, not mapped.

**Never.**

- Add `@Field()` back onto the persistence entity "just here".
- Return the raw document, leaking `__v` and internal fields.
- Do the conversion inline in more than one resolver or service.

**Incorrect (persistence document returned as the API type, internals leaking):**

```typescript
@Query(() => User)
async user(@Args('id') id: string) {
  return this.userModel.findById(id).lean(); // { _id, __v, passwordHash, email, ... }
}
```

Why it is wrong: the schema simply mirrors the database, and internal fields reach clients.

**Correct (entity stays persistence-only, model is the public graph, mapper converts):**

```typescript
// entities/user.entity.ts — persistence only
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop()
  avatarKey?: string;
}

// models/user.model.ts — the public graph
@ObjectType()
export class UserModel {
  @Field(() => ID)
  _id: string;

  @Field()
  email: string;

  @Field(() => String, { nullable: true })
  avatarUrl?: string; // computed from avatarKey

  @Field(() => Int)
  postCount!: number; // computed — resolved by @ResolveField, never mapped
}

// mappers/user.mapper.ts
export function toUserModel(doc: UserDocument): UserModel {
  return {
    _id: doc._id.toString(),
    email: doc.email,
    avatarUrl: doc.avatarKey ? cdnUrl(doc.avatarKey) : null,
  };
}
```

Why it is right: the database shape can change without touching the schema, the public graph
exposes only intended fields, and the conversion lives in one testable place.

Use this split only when the shapes actually diverge. For one-to-one domain objects, the merged
entity from `data-entity-mongodb` is simpler.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)

---

### 7.6 Mongoose Schema Best Practices for Shared Types

**Impact: MEDIUM-HIGH** — one class, correct schema options, nothing internal leaked

**Purpose.** In the default (merged) case one class is *both* the Mongoose schema
(`@Schema`/`@Prop`) and the GraphQL `@ObjectType` (`@Field`) — a single **shared type** that
drives storage and the schema at once (see `data-entity-mongodb`). Keeping that one class correct
means getting a few schema-level things right: the hydrated document type, explicit types where
reflection cannot infer them, real schema options, and the `_id`/`__v` boundary.

**Placement.** `modules/<feature>/entities/<entity>.entity.ts`.

**Responsibilities.**

- Declare the hydrated document type once: `export type UserDocument = HydratedDocument<User>`.
- Pass real schema options to `@Schema(...)`: `timestamps: true`, an explicit `collection`, and a
  `toJSON`/`toObject` transform when the stored shape needs normalising.
- Give an explicit `@Prop` type whenever TypeScript reflection cannot infer it — arrays, nested
  objects, and every `ref` (`@Prop([String])`, `@Prop({ type: Types.ObjectId, ref: 'Owner' })`).
- Expose `_id` with `@Field(() => ID)` (the `ID` scalar stringifies it); never expose `__v`.
- Declare `timestamps` fields (`createdAt`/`updatedAt`) with `@Field` when clients need them.
- Index every unique or frequently queried field.

**Never.**

- Rely on the `@nestjs/graphql` CLI plugin to infer `@Prop`/`@Field` types from Mongoose types — it
  cannot reflect `ObjectId`, `Date`, or a `ref`, so declare those explicitly.
- Return the document as-is and leak `__v`, or type a field as a Mongoose model where the schema
  promises an `ID`.
- Re-declare the same shared type in several features; share it through a base `@ObjectType` class
  (`@ObjectType({ implements: () => [Base] })`) and the GraphQL mapped types instead.
- Store computed or duplicated values on the schema — that is `data-derived-fields`.

**Incorrect (ambiguous types left to inference; internals leak):**

```typescript
// entities/user.entity.ts
@ObjectType()
@Schema()
export class User {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop()                       // array type left implicit -> stored as Mixed
  tags: string[];

  @Prop({ type: Types.ObjectId, ref: 'Owner' })
  owner: Owner;                 // ref type not declared -> reflection cannot resolve it

  // no timestamps/collection/transform -> __v reaches clients
}
```

Why it is wrong: reflection and the CLI plugin cannot infer Mongoose-specific types, so the array
is stored as `Mixed` and the `ref` is unresolved, while `__v` leaks because nothing normalises the
document.

**Correct (explicit types, real options, safe exposure):**

```typescript
// entities/user.entity.ts
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@ObjectType()
@Schema({
  timestamps: true,
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => [String])
  @Prop({ type: [String], default: [] })
  tags: string[];                                 // explicit array type

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Owner', required: true })
  ownerId: Types.ObjectId;                        // explicit ref type

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Prop({ required: true, select: false })        // persisted, never exposed
  passwordHash: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
```

Why it is right: every ambiguous type is explicit, the schema options are real, `__v` and secrets
stay out of the graph, and the same class is usable as both the stored document and the published
type.

When the published shape and the stored shape genuinely diverge — computed/derived fields, relation
fields — split into `models/` + `mappers/` instead; see `data-models-mappers` and
`data-derived-fields`.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [Mongoose Schemas](https://mongoosejs.com/docs/guide.html) | [NestJS GraphQL CLI Plugin](https://docs.nestjs.com/graphql/cli-plugin)

**Behavioral depth.** See `nestjs-best-practices` -> `perf-optimize-database`.

---

### 7.7 Keep Data Access in repositories/

**Impact: MEDIUM-HIGH** — services stay free of ORM detail

**Purpose.** A repository is the only place in a feature that talks to the database. It wraps
the model/ORM and exposes intention-revealing methods. Services depend on the repository;
nothing else touches the model.

**Placement.** `modules/<feature>/repositories/<feature>.repository.ts`. Class name
`<Feature>Repository`.

**Responsibilities.**

- Encapsulate every model/ORM call (queries, updates, transactions).
- Return domain entities to callers.
- Accept plain arguments and filter objects.

**Never.**

- Contain business rules or GraphQL types.
- Leak the raw model or query builder to callers.
- Be exported to other modules as a shared data layer — other modules go through services.

**Incorrect (ORM calls and a query pipeline inlined in the service):**

```typescript
// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findActiveWithOrders(minOrders: number) {
    return this.userModel.aggregate([
      { $match: { isActive: true } },
      { $lookup: { from: 'orders', localField: '_id', foreignField: 'userId', as: 'orders' } },
      { $match: { 'orders.0': { $exists: true } } },
      // ... a long pipeline living in business code
    ]);
  }
}
```

Why it is wrong: the service owns persistence detail, so changing the query or the store means
editing business code, and the query cannot be reused or tested in isolation.

**Correct (repository encapsulates persistence, service reads as intent):**

```typescript
// repositories/users.repository.ts
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  findActiveWithMinOrders(minOrders: number): Promise<UserDocument[]> {
    return this.userModel.aggregate([/* pipeline */]).exec();
  }

  create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }
}

// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findActiveWithMinOrders(minOrders: number): Promise<UserDocument[]> {
    return this.usersRepository.findActiveWithMinOrders(minOrders);
  }
}
```

Why it is right: persistence detail lives in one place; the service reads as business intent
and depends on an injected repository that is trivial to mock.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [Repository pattern](https://martinfowler.com/eaaCatalog/repository.html)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-repository-pattern`.

---

## 8. Config, Common & Infra

**Section Impact: MEDIUM**

### 8.1 Put Shared Types in common/types/

**Impact: MEDIUM** — context, auth user, and cross-cutting types have one home

**Purpose.** TypeScript types and interfaces that more than one feature needs — the GraphQL
request context, the authenticated user shape, shared pagination interfaces — are not tied to any
one feature. They live in `common/types/` so features import a single definition instead of
re-declaring (and drifting) their own.

**Placement.** `src/common/types/<name>.ts` (for example `gql-context.ts`,
`authenticated-user.ts`).

**Responsibilities.**

- Hold feature-agnostic types and interfaces: the GraphQL `Context`, the `AuthenticatedUser`,
  shared pagination interfaces.
- Export named types; keep one concept per file.
- Stay free of any dependency on a feature.

**Never.**

- Declare a shared type inline in a resolver or in `app.module.ts`.
- Put a feature's own type here — that belongs to the feature.
- Use `common/types/` as a junk drawer; a type only one feature needs stays in that feature.

**Incorrect (the context type redeclared wherever it is needed):**

```typescript
// modules/users/resolvers/users.query.resolver.ts
@Query(() => User)
user(@Context() ctx: { req: Request; user: AuthenticatedUser }) { /* ... */ }

// modules/orders/... the same shape re-declared by hand, already drifting
```

Why it is wrong: the same context shape is re-declared per file, and the copies drift apart.

**Correct (one shared type in common/types/):**

```typescript
// common/types/authenticated-user.ts
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
}

// common/types/gql-context.ts
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

export interface GqlContext {
  req: Request;
  user?: AuthenticatedUser;
}

// a feature imports the one definition
import type { GqlContext } from '../../common/types/gql-context';
```

Why it is right: the context and user shapes have a single definition that every feature and
`infra/graphql` share, so they cannot drift.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)

---

### 8.2 Put Shared Building Blocks in common/

**Impact: MEDIUM** — reusable, feature-agnostic helpers live here

**Purpose.** Cross-cutting building blocks that any feature may use — decorators, exception
filters, guards, interceptors, pipes, and custom scalars — live in `common/`. They know nothing
about any feature. Features import them; they never import a feature.

**Placement.** `src/common/{decorators,filters,guards,interceptors,pipes,scalars,utils}/`.

**Responsibilities.**

- Provide feature-agnostic, reusable helpers.
- Expose provider-based helpers (and shared services) through `common/shared.module.ts` when they
  need DI — see `infra-shared-module`.

**Never.**

- Import a feature module — `common/` sits below features in the dependency direction.
- Hold feature-specific logic; that belongs in the feature.
- Duplicate a helper into each feature; define it once here.

**Incorrect (a cross-cutting decorator copy-pasted per feature):**

```typescript
// modules/users/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(/* ... */);

// modules/orders/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(/* ... */); // the same code again
```

Why it is wrong: the same helper exists in several places and drifts as each copy is edited.

**Correct (one shared decorator in common/):**

```typescript
// common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    GqlExecutionContext.create(context).getContext().req.user,
);

// features import the one definition
import { CurrentUser } from '../../common/decorators/current-user.decorator';
```

Why it is right: defined once, used everywhere, and `common/` has no dependency on any feature.

Reference: [NestJS Custom Decorators](https://docs.nestjs.com/custom-decorators) | [NestJS Guards](https://docs.nestjs.com/guards)

---

### 8.3 Put Typed Configuration in config/

**Impact: MEDIUM** — no process.env scattered through the app

**Purpose.** Configuration lives in `config/` as typed namespaces plus a validation schema.
Modules inject `ConfigService` (or a namespaced config type) instead of reading `process.env`
directly, and validation runs at startup so a missing variable fails fast rather than in
production under load.

**Placement.** `src/config/app.config.ts`, `src/config/database.config.ts`,
`src/config/validation.schema.ts`.

**Responsibilities.**

- Define typed namespaces with `registerAs`.
- Validate required environment variables at startup (Joi or Zod).
- Load once and expose globally.

**Never.**

- Read `process.env` inside services or resolvers.
- Hardcode secrets or defaults at the point of use.
- Parse numbers or booleans ad hoc at each call site.

**Incorrect (scattered, unvalidated environment access):**

```typescript
@Injectable()
export class PaymentsService {
  charge() {
    const key = process.env.STRIPE_KEY;                     // untyped, unvalidated
    const retries = parseInt(process.env.RETRIES ?? '3');   // parsed at every call site
    // ...
  }
}
```

Why it is wrong: configuration has no single source of truth, typos fail silently at runtime,
and a missing variable is discovered only when that code path runs.

**Correct (typed namespaces, validated once, injected):**

```typescript
// config/app.config.ts
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  stripeKey: process.env.STRIPE_KEY,
}));

// config/validation.schema.ts
export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  STRIPE_KEY: Joi.string().required(),
});

// app.module.ts
ConfigModule.forRoot({ isGlobal: true, load: [appConfig], validationSchema });

// services/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(private readonly config: ConfigService) {}

  charge() {
    const key = this.config.get<string>('app.stripeKey'); // typed, validated at startup
  }
}
```

Why it is right: one typed source of truth, validated once at boot, injected where needed.

Reference: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)

**Behavioral depth.** See `nestjs-best-practices` -> `devops-use-config-module`.

---

### 8.4 Implement Custom Scalars in common/scalars/

**Impact: MEDIUM** — scalars are defined once and registered once

**Purpose.** A custom scalar (a `Date`, a `JSON` blob, an opaque id) is one definition shared by
every feature that references it. It lives in `common/scalars/` and is registered once at
bootstrap. This avoids re-declaring a `DateScalar` per feature and keeps the schema's scalar set
consistent.

**Placement.** `src/common/scalars/<name>.scalar.ts` (class `<Name>Scalar`). Registered once, as a
provider available to the schema builder (for example via `common/shared.module.ts`).

**Responsibilities.**

- Define the scalar once, implementing `CustomScalar` (`serialize` / `parseValue` / `parseLiteral`).
- Register it once.
- Keep it feature-agnostic.

**Never.**

- Re-declare the same scalar in more than one feature.
- Register the same scalar in several modules.
- Put feature-specific parsing in a shared scalar.

**Incorrect (a Date scalar re-declared per feature):**

```typescript
// modules/users/date.scalar.ts
@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> { /* copy 1 */ }

// modules/orders/date.scalar.ts
@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> { /* copy 2, drifting */ }
```

Why it is wrong: the same scalar exists twice and drifts, and the schema has no single definition.

**Correct (one shared scalar, provided once):**

```typescript
// common/scalars/date.scalar.ts
@Scalar('Date', () => Date)
export class DateScalar implements CustomScalar<number, Date> {
  description = 'Date custom scalar type';

  serialize(value: Date): number {
    return value.getTime();
  }

  parseValue(value: number): Date {
    return new Date(value);
  }

  parseLiteral(ast: ValueNode): Date | null {
    return ast.kind === Kind.INT ? new Date(parseInt(ast.value, 10)) : null;
  }
}

// common/shared.module.ts — provided once, so the schema builder registers it
@Module({ providers: [DateScalar], exports: [DateScalar] })
export class SharedModule {}
```

Why it is right: the scalar has one definition and one registration point, and every feature that
uses `Date` shares it.

Reference: [NestJS GraphQL Scalars](https://docs.nestjs.com/graphql/scalars) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)

---

### 8.5 Put Database Setup and Migrations in infra/database/

**Impact: MEDIUM** — the connection is configured once

**Purpose.** The database connection and migrations live in `infra/database/`. The module
configures the connection from typed config; migrations live in a subfolder; feature modules
declare only their own collections/entities via `forFeature`.

**Placement.** `src/infra/database/database.module.ts`, `database.providers.ts`, `migrations/`.

**Responsibilities.**

- Configure the connection from `ConfigService` (once).
- Export the connection module for features to import.
- Hold migration files.

**Never.**

- Configure the database in a feature module.
- Dump migrations at the repository root.
- Read database environment variables directly — use `config/`.

**Incorrect (a feature configures the whole database):**

```typescript
// modules/users/users.module.ts
@Module({ imports: [MongooseModule.forRoot(process.env.MONGO_URI)] })
export class UsersModule {}

// migrations/0001-init.ts at the repository root, beside unrelated folders
```

Why it is wrong: an arbitrary feature owns the connection, and migrations have no home.

**Correct (one infrastructure module, features register only their own schema):**

```typescript
// infra/database/database.module.ts
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('database.uri') }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}

// a feature declares only its own collection
@Module({ imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])] })
export class UsersModule {}
```

Why it is right: the connection is configured once from typed config, and each feature registers
only the collections it owns.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)

**Behavioral depth.** See `nestjs-best-practices` -> `db-use-migrations`.

---

### 8.6 Put Schema Directives in common/directives/

**Impact: MEDIUM** — GraphQL schema directives differ from param decorators

**Purpose.** A GraphQL schema directive (`@Directive()`, for example a field-level `@Auth`) is
applied to schema elements and is a different kind of thing from a parameter decorator like
`@CurrentUser()`. Directives are cross-cutting, so they live in `common/directives/`, alongside
the shared decorators but in their own folder. The directive's transformer is registered once, in
`infra/graphql/`.

**Placement.** `src/common/directives/<name>.directive.ts`. Register the directive's transformer
once in `infra/graphql/graphql.module.ts`.

**Responsibilities.**

- Hold reusable schema directives and any argument classes they take.
- Register the directive once, in the GraphQL infrastructure module.

**Never.**

- Put a schema directive in `common/decorators/` — it is a different kind of thing.
- Declare a directive inside a feature; directives are cross-cutting.
- Register the same directive's transformer in more than one place.

**Incorrect (directive buried in a feature, transformer registered locally):**

```typescript
// modules/users/directives/auth.directive.ts — a cross-cutting directive owned by one feature
export const AuthDirective = Directive('@auth');

// registered ad hoc inside the feature module
```

Why it is wrong: a cross-cutting directive has no shared home, so other features re-declare it and
its transformer gets registered more than once.

**Correct (one shared directive, registered once in infra/graphql/):**

```typescript
// common/directives/auth.directive.ts
export const AuthDirective = Directive('@auth');

// infra/graphql/graphql.module.ts — registered once
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: () => ({
    autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
    // directive transformers registered here, once
  }),
});

// a feature applies the shared directive on a field
@Field()
@AuthDirective()
email: string;
```

Why it is right: the directive has one shared definition and one registration point, and features
apply it without owning it.

Reference: [NestJS GraphQL Directives](https://docs.nestjs.com/graphql/directives) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)

---

### 8.7 Put Exceptions in exceptions/

**Impact: MEDIUM-HIGH** — one home for shared and feature-local error types

**Purpose.** Custom exception classes are their own file kind, so they get their own home. A
shared base or application-wide exception lives in `common/exceptions/`; an exception that belongs
to one feature lives in that feature's `exceptions/` folder, next to the module that throws it.
This gives `UserNotFoundException` and its peers one predictable location instead of being
declared inside a service file.

**Placement.**

- Shared/base: `src/common/exceptions/<name>.exception.ts` (e.g. `domain.exception.ts`).
- Feature-local: `modules/<feature>/exceptions/<name>.exception.ts` (e.g.
  `user-not-found.exception.ts`).

**Responsibilities.**

- Give each custom exception its own file and class.
- Keep a feature exception beside the feature that throws it.
- Keep a genuinely shared base or cross-feature exception in `common/exceptions/`.

**Never.**

- Declare exception classes inside a service, resolver, or module file.
- Put a feature-specific exception in `common/` — that couples `common/` to a feature.
- Duplicate the same exception class across features.

**Incorrect (exception declared inline in a service, then duplicated):**

```typescript
// modules/users/services/users.service.ts
class UserNotFoundException extends Error {} // hidden in a service file

// modules/orders/services/orders.service.ts
class UserNotFoundException extends Error {} // a second, drifting copy
```

Why it is wrong: the exception has no home, cannot be reused or filtered centrally, and the copies
drift as each is edited.

**Correct (one file per exception; shared base vs feature-local):**

```typescript
// common/exceptions/domain.exception.ts — the shared base
export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

// modules/users/exceptions/user-not-found.exception.ts — feature-local
export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(`User #${id} not found`, 'USER_NOT_FOUND');
  }
}

// modules/users/services/users.service.ts — imports the one definition
import { UserNotFoundException } from '../exceptions/user-not-found.exception';
```

Why it is right: each exception has one file and one home, a feature exception sits with its
feature, and a shared base lives in `common/` so a central filter can map it.

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)

**Behavioral depth.** See `nestjs-best-practices` -> `error-throw-domain-errors`, `error-use-exception-filters`.

---

### 8.8 Put GraphQL Setup in infra/graphql/

**Impact: MEDIUM** — one place configures the server and its context

**Purpose.** The `GraphQLModule` configuration and the per-request context factory live in
`infra/graphql/`. The module configures the driver, schema generation, and global options; the
context file builds the object every request sees — the request and the authenticated user.
Request-scoped providers such as DataLoaders are **not** built into the context; they are
request-scoped providers injected where they are used (see `relations-dataloader`).

**Placement.** `src/infra/graphql/graphql.module.ts`, `src/infra/graphql/graphql.context.ts`.

**Responsibilities.**

- Configure `GraphQLModule.forRootAsync` (driver, `autoSchemaFile`, global options).
- Build the request context: `req` and the authenticated `user`.
- Register global field middleware or custom scalars if needed.

**Never.**

- Scatter `GraphQLModule.forRoot` across feature modules.
- Build the context ad hoc inside resolvers.
- Hold request-scoped state as a singleton. DataLoaders are request-scoped providers injected
  where used (see `relations-dataloader`), never application singletons.

**Incorrect (context assembled per resolver, loader lifetime uncontrolled):**

```typescript
@Query(() => [Order])
async orders(@Context() ctx: any) {
  ctx.ordersLoader ??= new OrdersLoader(); // shared across requests, cache leaks
  return ctx.ordersLoader.loadByUserId('...');
}
```

Why it is wrong: the loader's lifetime is uncontrolled and GraphQL configuration has no single
home.

**Correct (config in the module, per-request context in one file):**

```typescript
// infra/graphql/graphql.module.ts
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        context: ({ req }: { req: Request }) => buildContext(req),
      }),
    }),
  ],
})
export class GraphqlInfraModule {}

// infra/graphql/graphql.context.ts
export function buildContext(req: Request) {
  return { req, user: req.user }; // request-scoped providers (e.g. loaders) are injected where used
}
```

Why it is right: the GraphQL server is configured once and every request gets its own context
object; request-scoped providers such as DataLoaders are injected where they are used, so no
cache leaks between requests.

Reference: [NestJS GraphQL Quick Start](https://docs.nestjs.com/graphql/quick-start)

---

### 8.9 Put Seed Scripts in infra/database/seeds/

**Impact: MEDIUM** — repeatable seed data has one home and one entry point

**Purpose.** Seed data — the baseline rows a fresh environment needs for local development,
demos, or tests — is a runnable concern, not application code. Seed scripts live beside migrations
in `infra/database/seeds/`, are idempotent, and are run through a single documented entry point.
They are never triggered from the request path or from a feature module's lifecycle.

**Placement.** `src/infra/database/seeds/<name>.seed.ts`, with a runner such as
`seeds/run-seeds.ts` (or an npm script) as the one entry point.

**Responsibilities.**

- Keep each seed script focused and idempotent (safe to run twice).
- Read connection details from `config/`, not hardcoded.
- Provide one documented way to run all seeds.

**Never.**

- Seed from a feature module or a resolver.
- Ship non-idempotent seeds that duplicate rows on every run.
- Hardcode credentials in a seed script.

**Incorrect (seed data created in application code on every startup):**

```typescript
// modules/users/users.module.ts
async onModuleInit() {
  await this.usersRepository.create({ email: 'admin@example.com' }); // runs on every boot
}
```

Why it is wrong: seeding happens in application code on every start, duplicates rows, and cannot
be run or skipped deliberately.

**Correct (one idempotent seed script behind a runner):**

```typescript
// infra/database/seeds/admin-user.seed.ts
export async function seedAdminUser(users: UsersRepository): Promise<void> {
  const existing = await users.findByEmail('admin@example.com');
  if (existing) return; // idempotent
  await users.create({ email: 'admin@example.com', roles: ['admin'] });
}

// infra/database/seeds/run-seeds.ts — the single entry point
// `npm run seed` runs every seed script once, against the configured database
```

Why it is right: seed data has one home, is idempotent, and runs only when asked.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [migrate-mongo](https://github.com/seppevs/migrate-mongo)

---

### 8.10 Use a SharedModule for Cross-Cutting Services

**Impact: MEDIUM-HIGH** — one home for shared providers; explicit by default

**Purpose.** Stateless services that many features use — hashing, id generation, a thin mailer or
HTTP wrapper, a clock — do not each need their own module, but they also do not belong to any one
feature. They live in a single `SharedModule`. By default, other modules **import** it; mark it
`@Global()` only for providers that genuinely every module needs.

**Placement.** `common/shared.module.ts`; the shared service classes under `common/services/`
(for example `common/services/hashing.service.ts`).

**Responsibilities.**

- Provide and export the shared, feature-agnostic services.
- Be imported explicitly by the features that use it.
- Become `@Global()` only when its providers are injected almost everywhere — logger, hashing,
  id generation, config. Register a global module once, in `AppModule`.

**Never.**

- Hold a service owned by one feature — that belongs in the feature's `services/`.
- Hold one-time infrastructure (DB connection, `GraphQLModule`, config registration) — that is
  `infra/`, imported once by the composition root.
- Go `@Global()` "to avoid writing imports" — that recreates the everywhere-is-available problem
  modules exist to prevent.
- Register a plain class that needs no injection — it does not need a module at all.

**Incorrect (a global module that swallows feature services and infrastructure):**

```typescript
// common/shared.module.ts
@Global()
@Module({
  imports: [MongooseModule.forRoot(process.env.MONGO_URI)], // infrastructure — belongs in infra/
  providers: [HashingService, UsersService, OrdersService], // feature services — belong to features
  exports: [HashingService, UsersService, OrdersService],
})
export class SharedModule {}
```

Why it is wrong: infrastructure is initialized outside `infra/`, feature services lose their module
boundary, and everything is global — so nothing is encapsulated.

**Correct (explicit SharedModule; @Global() only when genuinely app-wide):**

```typescript
// common/shared.module.ts
@Module({
  providers: [HashingService, SlugService, IdGeneratorService],
  exports: [HashingService, SlugService, IdGeneratorService],
})
export class SharedModule {}

// a feature imports it explicitly
@Module({ imports: [SharedModule], providers: [UsersService] })
export class UsersModule {}

// Only for truly app-wide providers, mark it global and register it once in AppModule:
// @Global()
// @Module({ providers: [AppLogger], exports: [AppLogger] })
// export class SharedModule {}
```

Why it is right: shared providers have one home; features declare the dependency by importing the
module; and `@Global()` is reserved for the handful of providers every module injects.

Reference: [NestJS Modules — Shared modules](https://docs.nestjs.com/modules#shared-modules) | [NestJS Modules — Global modules](https://docs.nestjs.com/modules#global-modules)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-module-sharing`.

---

## 9. Conventions & Testing

**Section Impact: MEDIUM**

### 9.1 Use Barrels and Path Aliases Deliberately

**Impact: MEDIUM** — shallow barrels, import by alias, no deep cross-feature imports

**Purpose.** Barrels (`index.ts`) and path aliases are conveniences with a cost: deep barrels hide
module boundaries and invite import cycles. Govern them explicitly. Use a barrel only at a module's
public edge (or a folder of like kinds), import across features through the module's public API, and
use a `@/` alias instead of fragile `../../..` chains.

**Placement.**

- Barrels: a single `index.ts` at a feature's public edge (or one per kind folder), never nested
  chains.
- Aliases: `tsconfig.json` `compilerOptions.paths` (for example `"@/*": ["src/*"]`,
  `"@common/*": ["src/common/*"]`).

**Responsibilities.**

- Re-export only the feature's public API from its barrel.
- Configure a small, stable set of path aliases.
- Import another feature through its public API, not into its internals.

**Never.**

- Re-export a feature's internals (repositories, entities, resolvers) from its barrel.
- Chain barrels (`a/index.ts` -> `b/index.ts` -> `c/index.ts`) so imports become cyclic and opaque.
- Import across features with deep relative paths into another feature's folders.

**Incorrect (deep relative import into another feature's internals):**

```typescript
// modules/orders/services/orders.service.ts
import { User } from '../../users/entities/user.entity';       // reaches into users internals
import { toUserModel } from '../../users/mappers/user.mapper';
```

Why it is wrong: orders couples to users' internals, so a refactor inside users breaks orders
silently.

**Correct (alias + the other feature's public API):**

```json
// tsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["src/*"], "@common/*": ["src/common/*"] } } }
```

```typescript
// modules/orders/services/orders.service.ts
import { UsersService } from '@/modules/users/services/users.service'; // users' public API
import { DomainException } from '@common/exceptions/domain.exception';

constructor(private readonly usersService: UsersService) {}
```

Why it is right: imports use a stable alias and go through the other feature's public API, so
boundaries and refactors stay predictable.

Reference: [TypeScript Path Mapping](https://www.typescriptlang.org/tsconfig#paths) | [NestJS Modules](https://docs.nestjs.com/modules)

---

### 9.2 Use the Nest CLI Generator, Then Adjust

**Impact: MEDIUM** — scaffold with the generator, then place files per this skill

**Purpose.** Use `nest g` to scaffold boilerplate, then move and adjust the generated files to
the canonical structure. The generator wires providers and imports for you; this skill decides
the final layout. Enable the GraphQL CLI plugin so the generator and compiler infer `@Field`
types.

**Placement.** Run from the project root; adjust the generated files into `modules/<feature>/`.

**Responsibilities.**

- Scaffold with `nest g resource <feature>` (GraphQL transport) or
  `nest g module|service|resolver`.
- Move generated files into the canonical subfolders.
- Enable the `@nestjs/graphql` plugin in `nest-cli.json`.

**Never.**

- Hand-write boilerplate the generator produces.
- Leave generated files in a default layout that differs from this skill.
- Ship a `nest-cli.json` without the GraphQL plugin in a code-first GraphQL app.

**Incorrect (no plugin, flat default layout):**

```json
// nest-cli.json
{ "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

Why it is wrong: without the plugin every `number` and nullable field needs a hand-written type
function, and a generated resource lands flat and then has to be reorganized by hand.

**Correct (plugin enabled, scaffold then place):**

```json
// nest-cli.json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/graphql",
        "options": { "typeFileNameSuffix": [".input.ts", ".model.ts", ".entity.ts"] }
      }
    ]
  }
}
```

```bash
nest g resource users
# then move the generated files into modules/users/{resolvers,services,dto,entities}/ per this skill
```

Why it is right: boilerplate and wiring are generated and type metadata is inferred, while the
final layout still follows this skill.

Reference: [NestJS CRUD Generator](https://docs.nestjs.com/recipes/crud-generator) | [NestJS CLI Plugin](https://docs.nestjs.com/cli/overview)

---

### 9.3 Keep Constants and Enums Out of Class Files

**Impact: MEDIUM** — one home per value; class files contain only their class

**Purpose.** A class file (`*.service.ts`, `*.resolver.ts`, `*.module.ts`, …) should contain its
class and nothing else. Constants, enums, and standalone helper functions declared at the top of
a class file have no home, cannot be reused or tested on their own, and invite copies that drift.
Give each of them its own file.

**Placement.**

- Feature-specific values: `modules/<feature>/constants/<name>.constants.ts` and
  `modules/<feature>/constants/<name>.enum.ts`.
- Cross-cutting values: `common/constants/`.

**Responsibilities.**

- Export named, typed constants and enums from a dedicated file.
- Name them for the concept (`UserStatus`, `MAX_PAGE_SIZE`).

**Never.**

- Declare a `const`, `enum`, or standalone helper at the top of a service, resolver, or module
  file.
- Inline magic literals in methods when a named constant or enum already exists.
- Park "a couple of helpers" in whatever class file first needed them.

**Incorrect (values buried in a class file):**

```typescript
// services/users.service.ts
const MAX_PAGE_SIZE = 100;                              // buried here, reusable nowhere
enum Status { Active = 'active', Banned = 'banned' }    // declared inside a class file

@Injectable()
export class UsersService {
  async findAll(page: number, limit: number) {
    if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;
    // ...
  }
}
```

Why it is wrong: the value and the enum live only in this file; the next feature that needs
`MAX_PAGE_SIZE` copies it, and the two copies drift.

**Correct (dedicated files, imported where needed):**

```typescript
// constants/user.constants.ts
export const MAX_PAGE_SIZE = 100;

// constants/user-status.enum.ts
export enum UserStatus {
  Active = 'active',
  Banned = 'banned',
}

// services/users.service.ts
import { MAX_PAGE_SIZE } from '../constants/user.constants';

@Injectable()
export class UsersService {
  async findAll(page: number, limit: number) {
    return this.usersRepository.findMany({
      page,
      limit: Math.min(limit, MAX_PAGE_SIZE),
    });
  }
}
```

Why it is right: each value has one home and one name, and class files stay about their class.

A GraphQL enum that must be registered code-first also lives in its own file and is registered
once with `registerEnumType` (see the GraphQL enums docs).

Reference: [TypeScript Enums](https://www.typescriptlang.org/docs/handbook/enums.html) | [NestJS GraphQL Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums)

---

### 9.4 Enforce Module Boundaries with Lint

**Impact: MEDIUM** — the folder rules are checked, not just documented

**Purpose.** Structure rules decay unless they are enforced. Add lint rules that encode the
dependency direction this skill teaches: `common/` never imports a feature; a feature imports another
feature only through its public API (its exported services), not its repositories, entities, or
resolvers; and `infra/` is imported only by the composition root. A boundaries plugin makes these
violations a CI failure instead of a review comment.

**Placement.** ESLint config at the repository root (`eslint.config.js`), with an architecture plugin
such as `eslint-plugin-boundaries`. No file lives in `src/` for this rule.

**Responsibilities.**

- Declare element types for `common/`, `infra/`, and each `modules/<feature>/`.
- Allow the dependency directions this skill defines; forbid the rest.
- Run lint in CI so a violation blocks the merge.

**Never.**

- Rely on convention alone for a boundary that matters (feature → feature internals).
- Let a lint suppression silently allow a boundary violation.
- Point a feature at another feature's repository, entity, or resolver.

**Incorrect (no boundary rule; internals imported freely):**

```typescript
// modules/orders/services/orders.service.ts
import { UsersRepository } from '../../users/repositories/users.repository'; // deep into users
import { UserEntity } from '../../users/entities/user.entity';
```

Why it is wrong: nothing stops one feature from reaching into another's internals, so the module
boundary exists only on paper and erodes on the next refactor.

**Correct (boundaries declared and enforced in lint):**

```javascript
// eslint.config.js (eslint-plugin-boundaries)
{
  settings: {
    'boundaries/elements': [
      { type: 'common', pattern: 'src/common/**' },
      { type: 'infra', pattern: 'src/infra/**' },
      { type: 'feature', pattern: 'src/modules/**', capture: ['feature'] },
    ],
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: 'feature', allow: ['common', 'feature'] }, // feature -> feature: public API only
        { from: 'common', allow: ['common'] },             // common never imports a feature
        { from: 'infra', allow: ['common'] },
      ],
    }],
  },
}
```

Why it is right: the dependency direction is machine-checked, so a misplaced import fails CI rather
than silently eroding the structure.

Reference: [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | [NestJS Modules](https://docs.nestjs.com/modules)

---

### 9.5 File and Class Naming Conventions

**Impact: MEDIUM** — predictable names make placement obvious

**Purpose.** Consistent naming is the cheapest way to keep the structure discoverable. Files are
named by feature and role; the role suffix matches the folder the file lives in; classes are
PascalCase and named after the concept.

**Placement.** Throughout `src/`.

**Placeholders.** `<feature>` is the feature's module/folder name, plural (for example `users`).
`<entity>` is the feature's primary domain noun, singular (for example `user`). Kinds named after
the feature — module, service, repository, resolver, loader, args — use `<feature>`; kinds named
after a single concept — entity, model, mapper, input — use `<entity>`.

**Responsibilities.**

- Name files `<feature>.<role>.ts` (or `<verb>-<feature>.<role>.ts` for inputs/args).
- Name classes after the concept, in PascalCase, ending with the role.

**Never.**

- Mix roles in one filename.
- Use generic names (`helpers.ts`, `utils.ts`) for feature code.
- Use a different suffix for the same role in different features.

**Incorrect (role unclear, generic, wrong case):**

```text
modules/users/
  usersStuff.ts          # role unclear
  helper.ts              # generic
  UsersQueryResolver.ts  # filename should be lower-case role-based
```

Why it is wrong: the filename does not say what the file is or where it belongs.

**Correct (one pattern per kind):**

| Kind | File pattern | Class |
|------|--------------|-------|
| Feature module | `<feature>.module.ts` | `<Feature>Module` |
| Query resolver | `<feature>.query.resolver.ts` | `<Feature>QueryResolver` |
| Mutation resolver | `<feature>.mutation.resolver.ts` | `<Feature>MutationResolver` |
| Cross-module field resolver | `<type>-<feature>.resolver.ts` | `<Type><Feature>Resolver` |
| Own-type field resolver (nested/computed) | `<type>.resolver.ts` | `<Type>Resolver` |
| Service | `<feature>.service.ts` / `<feature>-<concern>.service.ts` | `<Feature>Service` |
| Repository | `<feature>.repository.ts` | `<Feature>Repository` |
| Entity | `<entity>.entity.ts` | `<Entity>` |
| Input | `create-<entity>.input.ts` | `Create<Entity>Input` |
| Args | `find-<feature>.args.ts` | `Find<Feature>Args` |
| Loader | `<feature>.loader.ts` | `<Feature>Loader` |
| Event | `<feature>-<action>.event.ts` | `<Feature><Action>Event` |
| Listener | `<feature>-<action>.listener.ts` | `<Feature><Action>Listener` |
| Subscription resolver | `<feature>.subscription.resolver.ts` | `<Feature>SubscriptionResolver` |
| Provider (third-party client) | `<vendor>.provider.ts` | `<Vendor>Provider` |
| Queue processor | `<feature>.processor.ts` | `<Feature>Processor` |
| Scheduled job | `<feature>.job.ts` | `<Feature>Job` |
| Custom scalar | `<name>.scalar.ts` | `<Name>Scalar` |
| Union / interface type | `<name>.union.ts` / `<name>.interface.ts` | — |
| Port / contract | `<name>.interface.ts` | `<Name>` (+ `<NAME>` token) |
| Test factory | `test/factories/<name>.factory.ts` | `<Name>Factory` |
| Passport strategy | `<name>.strategy.ts` | `<Name>Strategy` |
| Exception | `<name>.exception.ts` | `<Name>Exception` |
| Schema directive | `<name>.directive.ts` | `<Name>Directive` |
| Pagination args | `<feature>-pagination.args.ts` | `<Feature>PaginationArgs` |
| Shared page types | `common/pagination/paginated.ts` | `Paginated<T>` / `PageInfo` |
| Unit test | `<name>.spec.ts` | — |
| E2E test | `<feature>.e2e-spec.ts` | — |

Why it is right: the role suffix matches the folder and the class name, so any file can be
located by name alone.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

---

### 9.6 Place Test Fixtures, Factories, and Helpers in test/

**Impact: MEDIUM** — shared test data has one home, separate from the specs

**Purpose.** Unit specs are co-located with their subject (see `conventions-testing`). The data those
specs share — seed objects, builders, fake providers, GraphQL request helpers — is not a spec, so it
does not sit inline in one spec or in a stray `helpers.ts`. It lives in `test/` (or a co-located
`__support__/` used by a single feature), so e2e and unit tests share one definition. Specs stay
about behavior; factories stay about shape.

**Placement.**

- Shared across the repository: `test/factories/`, `test/fixtures/`, `test/helpers/`.
- Single feature only: beside the specs, for example `modules/<feature>/services/__support__/`.

**Responsibilities.**

- Give builders and fixtures one home; name them for the entity (`UserFactory`, `aUser()`).
- Keep e2e helpers (an authenticated GraphQL client, a database reset) in `test/helpers/`.
- Drive GraphQL e2e tests by POSTing to `/graphql` against the real `AppModule`.

**Never.**

- Inline a shared fixture in one spec that other specs copy.
- Put a factory or fixture in `src/` — it is test-only.
- Hit a real external service from a helper (see `nestjs-best-practices` -> `test-mock-external-services`).

**Incorrect (shared test data copy-pasted into each spec):**

```typescript
// test/users.e2e-spec.ts and test/orders.e2e-spec.ts
const user = { id: '1', email: 'a@b.com', roles: ['user'] }; // copy 1
const user = { id: '1', email: 'a@b.com', roles: ['user'] }; // copy 2, drifts
```

Why it is wrong: the same fixture is duplicated per spec and drifts as the shape changes.

**Correct (one factory in test/, reused; e2e drives GraphQL):**

```typescript
// test/factories/user.factory.ts
export function aUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: '1', email: 'a@b.com', roles: ['user'], ...overrides };
}

// test/helpers/graphql.ts — one e2e request helper
export const gql = (app: INestApplication, query: string, variables?: object) =>
  request(app.getHttpServer()).post('/graphql').send({ query, variables });

// test/users.e2e-spec.ts
const res = await gql(app, `query { user(id: "1") { id email } }`).expect(200);
```

Why it is right: the fixture has one home and one shape, the e2e helper is shared, and the specs stay
about behavior.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

**Behavioral depth.** See `nestjs-best-practices` -> `test-use-testing-module`, `test-e2e-supertest`.

---

### 9.7 Test File Placement

**Impact: MEDIUM** — tests live next to what they test

**Purpose.** Unit tests are co-located with the code they cover, named `<name>.spec.ts`.
End-to-end tests live in a top-level `test/` folder. Neither lives in a technical `tests/`
layer, and tests follow the same feature-first organization as the code.

**Placement.** Unit: beside the subject, for example
`modules/<feature>/services/<feature>.service.spec.ts`. E2E: `test/<feature>.e2e-spec.ts`.

**Responsibilities.**

- Keep unit tests beside their subject.
- Keep e2e tests in `test/`.
- Mirror the feature structure in test names.

**Never.**

- Put unit tests in a separate top-level layer.
- Mix e2e specs among unit specs.
- Let the test layout diverge from the source layout.

**Incorrect (parallel technical layer, e2e mixed with unit):**

```text
src/
└── __tests__/
    ├── usersService.test.ts   # separated from its subject
    └── e2e-users.test.ts      # e2e mixed into the unit folder
```

Why it is wrong: tests are detached from their subjects and the two kinds are mixed, so neither
is easy to find or run.

**Correct (unit co-located, e2e in test/):**

```text
modules/users/services/
├── users.service.ts
└── users.service.spec.ts       # unit, beside its subject
test/
└── users.e2e-spec.ts           # e2e, one home
```

Why it is right: a unit test sits with its subject, and every e2e test has one place.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)

---

## References

- https://docs.nestjs.com/modules
- https://docs.nestjs.com/graphql/resolvers
- https://docs.nestjs.com/graphql/mapped-types
- https://docs.nestjs.com/fundamentals/dynamic-modules
- https://docs.nestjs.com/techniques/mongodb
- https://docs.nestjs.com/cli/overview
- https://github.com/graphql/dataloader
- https://docs.nestjs.com/graphql/interfaces
- https://docs.nestjs.com/graphql/unions-and-enums
- https://docs.nestjs.com/graphql/cli-plugin
- https://mongoosejs.com/docs/guide.html
- https://mongoosejs.com/docs/discriminators.html
- https://www.mongodb.com/docs/manual/data-modeling/best-practices/
- https://www.mongodb.com/docs/manual/data-modeling/design-patterns/computed-values/
- https://encore.dev/articles/nestjs-project-structure-best-practices

---

*Generated by build-agents.ts on 2026-10-17*
