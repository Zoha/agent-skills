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

// Custom throttle per user type
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return req.user?.id || req.ip;
  }

  protected async getLimit(context: ExecutionContext): Promise<number> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    if (request.user) {
      return request.user.isPremium ? 1000 : 200;
    }

    return 50; // Anonymous users
  }
}

// Query complexity limiting (GraphQL-native approach)
// Use graphql-query-complexity or similar to limit query depth and cost
import { complexityEstimator } from 'graphql-query-complexity';

const schema = buildSchema({
  typeDefs,
  validationRules: [
    complexityEstimator({ maximumComplexity: 1000 }),
  ],
});

// Rate limiting by query complexity
@Injectable()
export class ComplexityRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const info = context.getArgByIndex(1);
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
