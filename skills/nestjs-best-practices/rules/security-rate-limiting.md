---
title: Implement Rate Limiting
impact: HIGH
impactDescription: Protects against abuse and ensures fair resource usage
tags: graphql, rate-limiting, throttler, protection
---

## Implement Rate Limiting

Use `@nestjs/throttler` to limit request rates per resolver. Apply different limits for different resolvers - stricter for auth mutations, more relaxed for read queries. For GraphQL, also consider query complexity analysis to prevent expensive queries. Use Redis for distributed rate limiting in clustered deployments.

**Incorrect (no rate limiting on sensitive resolvers):**

```typescript
// No rate limiting on sensitive resolvers
@Resolver(() => Auth)
export class AuthResolver {
  @Mutation(() => TokenResponse)
  async login(@Args('input') input: LoginInput): Promise<TokenResponse> {
    // Attackers can brute-force credentials
    return this.authService.login(input);
  }

  @Mutation(() => Boolean)
  async forgotPassword(@Args('email') email: string): Promise<boolean> {
    // Can be abused to spam users with emails
    return this.authService.sendResetEmail(email);
  }
}

// Same limits for all resolvers
@UseGuards(ThrottlerGuard)
@Resolver(() => Query)
export class QueryResolver {
  @Query(() => String)
  publicData() {} // Should allow more requests

  @Mutation(() => Payment)
  processPayment() {} // Should be more restrictive
}
```

**Correct (configured throttler with resolver-specific limits):**

```typescript
// Configure throttler globally with multiple limits
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 3, // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 20, // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// Override limits per resolver
@Resolver(() => Auth)
export class AuthResolver {
  @Mutation(() => TokenResponse)
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  async login(@Args('input') input: LoginInput): Promise<TokenResponse> {
    return this.authService.login(input);
  }

  @Mutation(() => Boolean)
  @Throttle({ short: { limit: 3, ttl: 3600000 } }) // 3 per hour
  async forgotPassword(@Args('email') email: string): Promise<boolean> {
    return this.authService.sendResetEmail(email);
  }
}

// Skip throttling for certain resolvers
@Resolver(() => Health)
export class HealthResolver {
  @Query(() => String)
  @SkipThrottle()
  check(): string {
    return 'OK';
  }
}

// Key the throttle per authenticated user instead of per IP
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return req.user?.id || req.ip;
  }
}
// Per-route and per-user limits come from the named throttlers configured above plus
// @Throttle(...) on the resolver — ThrottlerGuard looks them up, so there is no
// per-limit getLimit() override (that was the v4 API, removed in v5).

// Query complexity limiting (GraphQL-native approach)
// A per-field rate limit does not stop one deeply nested, expensive query. Cap that
// separately with a query-complexity plugin/validation rule: the
// `graphql-query-complexity` package exposes a `createComplexityRule` factory that
// walks the parsed query, assigns each field a cost, and rejects the query before it
// executes when the total exceeds your maximum. On Apollo Server v4, register that
// rule as a plugin — the older `buildSchema({ validationRules: [...] })` option was
// removed in Apollo Server v3.

// Rate limiting by query complexity
@Injectable()
export class ComplexityRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const info = GqlExecutionContext.create(context).getInfo();
    const complexity = this.calculateComplexity(info);

    if (complexity > 1000) {
      throw new ForbiddenException('Query too complex');
    }

    return true;
  }

  private calculateComplexity(info: any): number {
    // Implement complexity calculation based on query depth and field count
    return info.fieldNodes.reduce((acc: number, node: any) => {
      return acc + this.getFieldComplexity(node);
    }, 0);
  }
}
```

Reference: [NestJS Throttler](https://docs.nestjs.com/security/rate-limiting) | [GraphQL Query Complexity](https://docs.nestjs.com/graphql/other-features)
