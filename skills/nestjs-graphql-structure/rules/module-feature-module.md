---
title: The Feature Module File
impact: CRITICAL
impactDescription: a module declares its own providers and exports
tags: modules, providers, encapsulation
---

## The Feature Module File

**Impact: CRITICAL (a module declares its own providers and exports)**

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
