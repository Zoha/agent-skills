---
title: Use Exception Filters for Error Handling
impact: HIGH
impactDescription: Consistent, centralized error handling
tags: graphql, exception-filters, consistency
---

## Use Exception Filters for Error Handling

Never catch exceptions and manually format error responses in resolvers. Use NestJS exception filters to handle errors consistently across your application. Create custom exception filters for specific error types and a global filter for unhandled exceptions. In GraphQL, format errors as `GraphQLError` with extensions.

**Incorrect (manual error handling in resolvers):**

```typescript
// Manual error handling in resolvers
@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  async user(@Args('id') id: string, @Res() res: Response) {
    try {
      const user = await this.usersService.findById(id);
      if (!user) {
        return res.status(404).json({
          statusCode: 404,
          message: 'User not found',
        });
      }
      return user;
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        statusCode: 500,
        message: 'Internal server error',
      });
    }
  }
}
```

**Correct (exception filters with consistent GraphQL handling):**

```typescript
// Use built-in and custom exceptions
@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  async user(@Args('id') id: string): Promise<User> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new GraphQLError(`User #${id} not found`, {
        extensions: { code: 'USER_NOT_FOUND' },
      });
    }
    return user;
  }
}

// Custom domain exception
export class UserNotFoundException extends GraphQLError {
  constructor(userId: string) {
    super(`User with ID "${userId}" not found`, {
      extensions: {
        code: 'USER_NOT_FOUND',
        http: { status: 404 },
      },
    });
  }
}

// Custom exception filter for domain errors
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.extensions?.http?.status || 400;

    response.status(status).json({
      errors: [
        {
          message: exception.message,
          extensions: {
            code: exception.extensions?.code,
            timestamp: new Date().toISOString(),
            path: request.url,
          },
        },
      ],
    });
  }
}

// Global exception filter for unhandled errors
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error
        ? exception.message
        : 'Internal server error';

    this.logger.error(
      `${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : exception,
    );

    response.status(status).json({
      errors: [
        {
          message,
          extensions: {
            code: 'INTERNAL_SERVER_ERROR',
            timestamp: new Date().toISOString(),
            path: request.url,
          },
        },
      ],
    });
  }
}

// Register globally in main.ts
app.useGlobalFilters(
  new AllExceptionsFilter(app.get(Logger)),
  new DomainExceptionFilter(),
);

// Or via module
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
```

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters) | [GraphQL Other Features](https://docs.nestjs.com/graphql/other-features)
