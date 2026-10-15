---
title: Export Only the Feature's Public API (Its Services)
impact: HIGH
impactDescription: one narrow entry point; internals stay private
tags: modules, exports, encapsulation, boundaries
---

## Export Only the Feature's Public API (Its Services)

**Impact: HIGH (one narrow entry point; internals stay private)**

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
