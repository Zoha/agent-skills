---
title: Put GraphQL Setup in infra/graphql/
impact: MEDIUM
impactDescription: one place configures the server and its context
tags: graphql, context, dataloader
---

## Put GraphQL Setup in infra/graphql/

**Impact: MEDIUM (one place configures the server and its context)**

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
