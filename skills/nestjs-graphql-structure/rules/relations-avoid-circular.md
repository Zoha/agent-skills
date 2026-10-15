---
title: Resolve Circular Module Dependencies
impact: CRITICAL
impactDescription: a cycle is an architecture bug, not a wiring problem
tags: circular-dependency, modules, forwardRef
---

## Resolve Circular Module Dependencies

**Impact: CRITICAL (a cycle is an architecture bug, not a wiring problem)**

**Purpose.** A circular dependency is when module A imports module B and B imports A, directly
or transitively. It is an architecture problem: the two modules are really one, or the shared
piece belongs in a third module. Fix the structure first; `forwardRef` is a last resort that
hides the cycle rather than removing it.

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
