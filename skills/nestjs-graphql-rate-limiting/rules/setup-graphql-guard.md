---
title: Make the Guard Read the GraphQL Context
impact: CRITICAL
impactDescription: the stock guard silently mis-reads the request on resolvers
tags: graphql, throttler, guard, gql-execution-context
---

## Make the Guard Read the GraphQL Context

**Impact: CRITICAL (the stock guard silently mis-reads the request on resolvers)**

`ThrottlerGuard` reads the request through `ExecutionContext.switchToHttp()`. On a **resolver** the
execution context type is `graphql`, not `http`, so `switchToHttp().getRequest()` does not return your
Express/Fastify request. The stock guard therefore keys every resolver onto the wrong (or an empty)
request object. Subclass it and override `getRequestResponse` to pull `req`/`res` from
`GqlExecutionContext`, and make sure the GraphQL context actually contains them.

**Incorrect (the stock guard registered directly, context without req/res):**

```typescript
@Module({ providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }] })
export class AppModule {}

// infra/graphql/graphql.module.ts
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: () => ({}),          // no req/res -> whatever the guard finds is not the HTTP request
});
```

Why it is wrong: on resolvers the guard's request is not the HTTP request, so tracking is wrong (often
everyone collides on one bucket) or the guard throws when it dereferences a missing property.

**Correct (a GraphQL-aware guard, and a context that carries the transport objects):**

```typescript
// common/guards/gql-throttler.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext): { req: any; res: any } {
    const gql = GqlExecutionContext.create(context);
    const ctx = gql.getContext();               // the object built by GraphQLModule context
    return { req: ctx.req, res: ctx.res };
  }
}
```

```typescript
// infra/graphql/graphql.module.ts — the context the guard reads from
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
});

// app.module.ts — register the subclass, not the base class
@Module({ providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }] })
export class AppModule {}
```

Why it is right: the guard now receives the real HTTP request on resolvers, so the tracker and key are
computed from the correct object, and the context shape it depends on is guaranteed by the module.

**This guard runs once per resolver method, not once per HTTP request.** Nest binds guards to
resolvers, so an `APP_GUARD` covers every `@Query`, `@Mutation` and `@ResolveField` — which makes it the
natural **field** limiter, and the wrong tool for an operation count. The per-operation / per-endpoint
limit is a middleware or an Apollo plugin (`op-count-operations`). Register this subclass once, globally;
do not also `@UseGuards` the base class anywhere.

The same subclass is also where the tracker is defined (`identity-tracker-hierarchy`) and where the
kill switch short-circuits (`setup-kill-switch`). On Fastify/Mercurius the context keys differ — see
`driver-alignment`.

Reference: [nestjs/throttler — GraphQL guard](https://github.com/nestjs/throttler) | [NestJS GraphQL resolvers](https://docs.nestjs.com/graphql/resolvers)
