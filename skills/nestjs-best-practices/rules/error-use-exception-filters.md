---
title: Use Exception Filters for Error Handling
impact: HIGH
impactDescription: Consistent, centralized error handling
tags: graphql, exception-filters, consistency
---

## Use Exception Filters for Error Handling

Never catch exceptions and manually format error responses in resolvers. Use NestJS exception filters to handle errors consistently across your application. Create custom exception filters for specific error types and a global filter for unhandled exceptions. In GraphQL, a filter converts a domain exception into a `GraphQLError` with `extensions` — it does not write an HTTP response. Filters live in `common/filters/`.

**Incorrect (manual error handling in resolvers):**

```typescript
// Manual error handling in resolvers
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => User)
  async user(@Args() args: FindUserArgs): Promise<User> {
    try {
      const user = await this.usersService.findById(args.id);
      return user;
    } catch (error) {
      console.error(error);
      // Reformatted by hand in every resolver, inconsistently
      return { message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' } as User;
    }
  }
}
```

**Correct (exception filters with consistent GraphQL handling):**

```typescript
// A domain exception thrown by the service (one file per exception)
export class UserNotFoundException extends DomainException {
  constructor(userId: string) {
    super(`User with ID "${userId}" not found`, 'USER_NOT_FOUND');
  }
}

// common/filters/domain-exception.filter.ts — maps domain exceptions to GraphQL errors
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost) {
    // GraphQL-native: rethrow a GraphQLError the schema layers understand
    throw new GraphQLError(exception.message, {
      extensions: {
        code: exception.code,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// common/filters/all-exceptions.filter.ts — global filter for unhandled errors
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger = new Logger('AllExceptionsFilter')) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const message =
      exception instanceof Error
        ? exception.message
        : 'Internal server error';

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    );

    throw new GraphQLError(message, {
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Register globally in main.ts — bootstrap wires the global concerns
app.useGlobalFilters(
  new AllExceptionsFilter(),
  new DomainExceptionFilter(),
);
```

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters) | [GraphQL Other Features](https://docs.nestjs.com/graphql/other-features)
