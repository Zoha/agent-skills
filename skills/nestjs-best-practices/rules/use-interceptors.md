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

// Custom cache interceptor with TTL
@Injectable()
export class GraphQLCacheInterceptor implements NestInterceptor {
  constructor(
    private cacheManager: Cache,
    private reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const cacheKey = this.generateKey(context);
    const ttl = this.reflector.get<number>('cacheTTL', context.getHandler()) || 300;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return of(cached);
    }

    return next.handle().pipe(
      tap((response) => {
        this.cacheManager.set(cacheKey, response, ttl);
      }),
    );
  }

  private generateKey(context: ExecutionContext): string {
    const info = GqlExecutionContext.create(context).getInfo();
    return `gql:${info.parentType.name}.${info.fieldName}:${JSON.stringify(context.getArgByIndex(1))}`;
  }
}

// Usage with custom TTL
@Query(() => [User])
@UseInterceptors(GraphQLCacheInterceptor)
@SetMetadata('cacheTTL', 600)
async users(): Promise<User[]> {
  return this.usersService.findAll();
}
```

Apply interceptors at the resolver class level:
```typescript
@Resolver(() => User)
@UseInterceptors(LoggingInterceptor, TimeoutInterceptor)
export class UsersQueryResolver {
  // All resolver methods now have interceptors applied
}
```

Reference: [NestJS Interceptors](https://docs.nestjs.com/interceptors) | [GraphQL Other Features](https://docs.nestjs.com/graphql/other-features)
