---
title: Use Interceptors for Cross-Cutting Concerns
impact: MEDIUM-HIGH
impactDescription: Interceptors provide clean separation for cross-cutting logic
tags: graphql, interceptors, logging, caching
---

## Use Interceptors for Cross-Cutting Concerns

Interceptors can transform responses, add logging, handle caching, and measure performance without polluting your business logic. They wrap the resolver execution, giving you access to both the request and response streams. Interceptors work identically in GraphQL resolvers via `@UseInterceptors()` decorator.

**Incorrect (logging and transformation in every resolver):**

```typescript
// Logging in every resolver method
@Resolver(() => User)
export class UsersResolver {
  @Query(() => [User])
  async users(): Promise<User[]> {
    const start = Date.now();
    this.logger.log('users query called');

    const users = await this.usersService.findAll();

    this.logger.log(`users query completed in ${Date.now() - start}ms`);
    return users;
  }

  @Query(() => User)
  async user(@Args('id') id: string): Promise<User> {
    const start = Date.now();
    this.logger.log(`user query called with id: ${id}`);

    const user = await this.usersService.findOne(id);

    this.logger.log(`user query completed in ${Date.now() - start}ms`);
    return user;
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
// Logging interceptor
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQL');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const info = context.getArgByIndex(1); // GraphQL args
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.logger.log(
            `${context.getHandler().name} - ${Date.now() - now}ms`,
          );
        },
        error: (error) => {
          this.logger.error(
            `${context.getHandler().name} - ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }
}

// Response transformation interceptor
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}

// Timeout interceptor
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

// Apply globally or per-resolver
@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}

// Or per-resolver
@Resolver(() => User)
@UseInterceptors(LoggingInterceptor)
export class UsersResolver {
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
    const info = context.getArgByIndex(1);
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
    const gqlArgs = context.getArgByIndex(1);
    return `gql:${context.getHandler().name}:${JSON.stringify(gqlArgs)}`;
  }
}

// Usage with custom TTL
@Query(() => [User])
@UseInterceptors(GraphQLCacheInterceptor)
@SetMetadata('cacheTTL', 600)
async users(): Promise<User[]> {
  return this.usersService.findAll();
}

// Error mapping interceptor
@Injectable()
export class ErrorMappingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof EntityNotFoundError) {
          throw new GraphQLError(error.message, {
            extensions: { code: 'NOT_FOUND' },
          });
        }
        throw error;
      }),
    );
  }
}
```

Apply interceptors at the resolver class level:
```typescript
@Resolver(() => User)
@UseInterceptors(LoggingInterceptor, TransformInterceptor)
export class UsersResolver {
  // All resolver methods now have interceptors applied
}
```

Reference: [NestJS Interceptors](https://docs.nestjs.com/interceptors) | [GraphQL Other Features](https://docs.nestjs.com/graphql/other-features)
