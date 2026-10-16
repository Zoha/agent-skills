---
title: Keep main.ts and app.module.ts Thin
impact: CRITICAL
impactDescription: bootstrap and composition, nothing else
tags: bootstrap, appmodule, composition
---

## Keep main.ts and app.module.ts Thin

**Impact: CRITICAL (bootstrap and composition, nothing else)**

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
