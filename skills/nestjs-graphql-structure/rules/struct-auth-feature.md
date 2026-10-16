---
title: Keep Authentication in Its Own Feature Module
impact: CRITICAL
impactDescription: auth is a bounded context with its own strategies and guards
tags: auth, structure, strategies, guards
---

## Keep Authentication in Its Own Feature Module

**Impact: CRITICAL (auth is a bounded context with its own strategies and guards)**

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
