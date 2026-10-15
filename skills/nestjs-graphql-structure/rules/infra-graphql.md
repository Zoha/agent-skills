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
context file builds the object every request sees — the request, the authenticated user, and
the per-request DataLoaders.

**Placement.** `src/infra/graphql/graphql.module.ts`, `src/infra/graphql/graphql.context.ts`.

**Responsibilities.**

- Configure `GraphQLModule.forRootAsync` (driver, `autoSchemaFile`, global options).
- Build the request context: `req`, `user`, and fresh `loaders`.
- Register global field middleware or custom scalars if needed.

**Never.**

- Scatter `GraphQLModule.forRoot` across feature modules.
- Build the context ad hoc inside resolvers.
- Create DataLoaders anywhere but the context — they must be per request (see
  `relations-dataloader`).

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
  return {
    req,
    user: req.user,
    loaders: createRequestLoaders(), // fresh loader instances per request
  };
}
```

Why it is right: the GraphQL server is configured once, and every request gets its own context
with its own loaders, so no cache leaks between requests.

Reference: [NestJS GraphQL Quick Start](https://docs.nestjs.com/graphql/quick-start)
