---
title: Organize by Feature Modules
impact: CRITICAL
impactDescription: "3-5x faster onboarding and development"
tags: architecture, modules, organization
---

## Organize by Feature Modules

Organize your application into feature modules that encapsulate related functionality. Each feature module should be self-contained with its own resolvers, services, repositories, entities, inputs, and args. Avoid organizing by technical layer (all resolvers together, all services together). This enables 3-5x faster onboarding and feature development. A feature that grows is decomposed into nested modules rather than becoming one large module (see `struct-feature-decomposition` in `nestjs-graphql-structure`).

**Incorrect (technical layer organization):**

```typescript
// Technical layer organization (anti-pattern)
src/
├── resolvers/
│   ├── users.resolver.ts
│   ├── orders.resolver.ts
│   └── products.resolver.ts
├── services/
│   ├── users.service.ts
│   ├── orders.service.ts
│   └── products.service.ts
├── entities/
│   ├── user.entity.ts
│   ├── order.entity.ts
│   └── product.entity.ts
└── app.module.ts  // Imports everything directly
```

**Correct (feature module organization):**

```typescript
// Feature module organization — a feature-first layout
// The full annotated map is owned by nestjs-graphql-structure -> struct-canonical-layout;
// this is a compact representative example.
src/
├── main.ts
├── app.module.ts                        // composition root: imports modules, no logic
├── common/                              // feature-agnostic building blocks
├── infra/                               // one-time infrastructure
├── modules/
│   └── users/                           // one folder per bounded context
│       ├── resolvers/                   // users.query.resolver.ts, users.mutation.resolver.ts
│       ├── services/                    // users.service.ts
│       ├── repositories/                // users.repository.ts
│       ├── dto/                         // create-user.input.ts, find-users.args.ts
│       ├── entities/                    // user.entity.ts
│       └── users.module.ts
└── test/
    └── users.e2e-spec.ts

// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersQueryResolver, UsersMutationResolver, UsersService, UsersRepository],
  exports: [UsersService], // Only export the feature's public API
})
export class UsersModule {}

// app.module.ts — the composition root lists modules, not providers
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,        // infra/database — connection configured once
    GraphqlInfraModule,    // infra/graphql — GraphQLModule + context
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
```

Reference: [NestJS Modules](https://docs.nestjs.com/modules)
