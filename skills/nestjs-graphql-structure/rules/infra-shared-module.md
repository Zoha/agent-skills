---
title: Use a SharedModule for Cross-Cutting Services
impact: MEDIUM-HIGH
impactDescription: one home for shared providers; explicit by default
tags: modules, shared, global, cross-cutting
---

## Use a SharedModule for Cross-Cutting Services

**Impact: MEDIUM-HIGH (one home for shared providers; explicit by default)**

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
