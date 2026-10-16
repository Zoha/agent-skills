---
title: Distinguish Domain Features from App-Level Modules
impact: HIGH
impactDescription: modules/ holds bounded contexts plus a few app-level modules
tags: structure, modules, health, auth
---

## Distinguish Domain Features from App-Level Modules

**Impact: HIGH (modules/ holds bounded contexts plus a few app-level modules)**

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
