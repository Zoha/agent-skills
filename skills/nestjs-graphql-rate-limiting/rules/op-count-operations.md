---
title: Count Once per Operation, Not Once per Field
impact: CRITICAL
impactDescription: the per-field trap makes a list query spend its budget N times
tags: graphql, guard, middleware, operations, batching
---

## Count Once per Operation, Not Once per Field

**Impact: CRITICAL (the per-field trap makes a list query spend its budget N times)**

Two facts about NestJS + GraphQL decide where the limit lives:

1. **Nest binds guards to resolver methods.** A `@Query`, `@Mutation` or `@ResolveField` method is a
   resolver, and an `APP_GUARD` runs for **each** of them, so `ThrottlerGuard` on a GraphQL app counts
   *resolver invocations*, not HTTP requests. A list query invokes its field resolver once **per
   parent** (`users { posts }` over 100 users runs the `posts` resolver 100 times), so one read can
   spend the budget N times over. Measure the multiplier for your schema with a counted test
   (`test-storage-and-time`) instead of assuming it.
2. **One HTTP POST can carry several operations** (Apollo batching) or one field under many **aliases**.

So "endpoint call rate limit" and "field rate limit" are different mechanisms:

| You want | Count it with | Runs |
|---|---|---|
| Endpoint / operation limit | HTTP middleware before the GraphQL endpoint, or an Apollo `didResolveOperation` plugin | once per request/operation |
| Field limit | the Nest guard (throttler) | once per resolver field |

**Incorrect (assume the global guard limits requests, and allow batching):**

```typescript
@Module({ providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }] })
export class AppModule {}

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  allowBatchedHttpRequests: true,       // one POST -> many operations, each uncounted
});
```

Why it is wrong: the count is per field, so the numbers mean nothing; and batching lets one POST hide
many operations from any per-request counter.

**Correct (a once-per-request counter, plus the field layer kept separate):**

```typescript
// infra/rate-limit/operation-rate-limit.middleware.ts — mounted before the GraphQL handler
@Injectable()
export class OperationRateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly store: ThrottlerStorage,        // the same shared store (`setup-storage`)
    @Inject(RATELIMIT_OPTIONS) private readonly opts: RateLimitOptions,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tracker = resolveTracker(req);             // `identity-tracker-hierarchy`
    const key = `op:${tracker}:${this.opts.window}`;
    const { totalHits, isBlocked, timeToBlockExpire } =
      await this.store.increment(key, this.opts.ttl, this.opts.limit, this.opts.blockDuration, 'op');
    if (isBlocked) return this.reject(res, timeToBlockExpire);   // `obs-error-shape`
    next();
  }
}
```

```typescript
// infra/graphql/graphql.module.ts — one operation per request unless you truly need batching
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  allowBatchedHttpRequests: false,
});
```

Why it is right: the middleware runs exactly once per HTTP request, the field-level guard keeps its own
separate meaning, and batching cannot smuggle work past the counter.

If a client genuinely needs batching, charge **per operation in the batch**: in an Apollo
`didResolveOperation` plugin or a batched-body middleware, increment once per element of the request
array rather than once per HTTP request. Aliases inside one operation are handled by the cost rule
(`op-cost-based-limits`, `depth-breadth-aliases`), not by a second counter.

Reference: [NestJS Guards](https://docs.nestjs.com/guards) | [Apollo Server request pipeline](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)
