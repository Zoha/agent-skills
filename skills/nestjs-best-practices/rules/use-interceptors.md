---
title: Use Interceptors for Cross-Cutting Concerns
impact: MEDIUM-HIGH
impactDescription: Interceptors provide clean separation for cross-cutting logic
tags: graphql, interceptors, logging, caching
---

## Use Interceptors for Cross-Cutting Concerns

Interceptors can transform responses, add logging, handle caching, and measure performance without polluting your business logic. They wrap the resolver execution. Interceptors work identically in GraphQL resolvers via `@UseInterceptors()`; shared interceptors live in `common/interceptors/`, and read the request through `GqlExecutionContext`.

**Incorrect (logging and transformation in every resolver):**

```typescript
// Logging in every resolver method
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => [User])
  async users(): Promise<User[]> {
    const start = Date.now();
    this.logger.log('users query called');

    const users = await this.usersService.findAll();

    this.logger.log(`users query completed in ${Date.now() - start}ms`);
    return users;
  }
  // Repeated in every method!
}

// Manual response wrapping
@Query(() => UserWrapper)
async users(): Promise<{ data: User[]; meta: Meta }> {
  const users = await this.usersService.findAll();
  return {
    data: users,
    meta: { timestamp: new Date(), count: users.length },
  };
}
```

**Correct (use interceptors for cross-cutting concerns):**

```typescript
// common/interceptors/logging.interceptor.ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQL');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${info.parentType.name}.${info.fieldName} - ${Date.now() - now}ms`,
          );
        },
        error: (error) => {
          this.logger.error(
            `${info.parentType.name}.${info.fieldName} - ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }
}

// common/interceptors/timeout.interceptor.ts
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          throw new RequestTimeoutException('Request timed out');
        }
        throw err;
      }),
    );
  }
}

// main.ts — bootstrap registers the global interceptors
app.useGlobalInterceptors(
  app.get(LoggingInterceptor),
  new TimeoutInterceptor(),
);

// Or per-resolver
@Resolver(() => User)
@UseInterceptors(LoggingInterceptor)
export class UsersQueryResolver {
  @Query(() => [User])
  async users(): Promise<User[]> {
    // Clean business logic only
    return this.usersService.findAll();
  }
}

// common/interceptors/graphql-cache.interceptor.ts — the ONE definition of this interceptor.
// The metadata key names its unit: `cacheTtlMs` is MILLISECONDS (see the version note below).
@Injectable()
export class GraphQLCacheInterceptor implements NestInterceptor {
  private static readonly DEFAULT_TTL_MS = 60_000;

  constructor(
    private cacheManager: Cache,
    private reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const cacheKey = this.generateKey(context);
    const ttlMs =
      this.reflector.get<number>('cacheTtlMs', context.getHandler()) ??
      GraphQLCacheInterceptor.DEFAULT_TTL_MS;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return of(cached);
    }

    return next.handle().pipe(
      tap((response) => {
        // a cache write failure must never surface as an unhandled rejection
        void this.cacheManager.set(cacheKey, response, ttlMs).catch(() => undefined);
      }),
    );
  }

  private generateKey(context: ExecutionContext): string {
    const info = GqlExecutionContext.create(context).getInfo();
    const args = (context.getArgByIndex(1) ?? {}) as Record<string, unknown>;
    // Stable serialization: key order must not change the key. `JSON.stringify` on a plain object
    // follows insertion order, so `{a,b}` and `{b,a}` would produce different keys and silently
    // miss. Sort the keys before serializing; for nested arguments use `safe-stable-stringify`.
    const stable = JSON.stringify(
      Object.keys(args)
        .sort()
        .map((k) => [k, args[k]]),
    );
    return `gql:${info.parentType.name}.${info.fieldName}:${stable}`;
  }
}

// Usage with an explicit TTL in MILLISECONDS
@Query(() => [User])
@UseInterceptors(GraphQLCacheInterceptor)
@SetMetadata('cacheTtlMs', 60_000)
async users(): Promise<User[]> {
  return this.usersService.findAll();
}
```

**Unit, once:** `@nestjs/cache-manager` v5 (Keyv) takes `ttl` in **milliseconds**; v4 took **seconds**.
A user who upgrades and keeps `ttl: 300` silently gets 300 ms instead of 5 minutes. That is why the
metadata key is named `cacheTtlMs` and never renamed: the unit is visible at every call site.
If you already ship `cacheTTL`, it was milliseconds there too; rename the key next time you touch
the file rather than leaving two names for one unit in the codebase.

**When a static TTL is not enough**, use the `nestjs-graphql-swr-caching` skill's `@Cacheable`
surface instead. It gives real stale-while-revalidate, single-flight dedupe, and tag invalidation,
none of which a response interceptor can express.

**One definition, one home.** This interceptor is defined here and nowhere else. Other rules
(`perf-use-caching`) set the metadata and assume this file; do not fork a second copy.

Apply interceptors at the resolver class level:
```typescript
@Resolver(() => User)
@UseInterceptors(LoggingInterceptor, TimeoutInterceptor)
export class UsersQueryResolver {
  // All resolver methods now have interceptors applied
}
```

Reference: [NestJS Interceptors](https://docs.nestjs.com/interceptors) | [GraphQL Other Features](https://docs.nestjs.com/graphql/other-features)
