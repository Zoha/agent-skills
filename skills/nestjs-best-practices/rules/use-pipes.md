---
title: Use Pipes for Input Transformation
impact: MEDIUM
impactDescription: Pipes ensure clean, validated data reaches your resolvers
tags: graphql, pipes, validation, transformation
---

## Use Pipes for Input Transformation

Use built-in pipes like `ParseIntPipe`, `ParseUUIDPipe`, and `DefaultValuePipe` for common transformations. Create custom pipes for business-specific transformations. Pipes separate validation/transformation logic from resolvers. Pipes work identically in GraphQL resolvers via `@UsePipes()` decorator.

**Incorrect (manual type parsing in resolvers):**

```typescript
// Manual type parsing in resolvers
@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  async user(@Args('id') id: string): Promise<User> {
    // Manual validation in every resolver
    const uuid = id.trim();
    if (!isUUID(uuid)) {
      throw new BadRequestException('Invalid UUID');
    }
    return this.usersService.findOne(uuid);
  }

  @Query(() => [User])
  async users(
    @Args('page') page: string,
    @Args('limit') limit: string,
  ): Promise<User[]> {
    // Manual parsing and defaults
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    return this.usersService.findAll(pageNum, limitNum);
  }
}

// Type coercion without validation
@Query(() => [Product])
async search(@Args('price') price: string): Promise<Product[]> {
  const priceNum = +price; // NaN if invalid, no error
  return this.productsService.findByPrice(priceNum);
}
```

**Correct (use built-in and custom pipes):**

```typescript
// Use built-in pipes for common transformations
@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  async user(@Args('id', ParseUUIDPipe) id: string): Promise<User> {
    // id is guaranteed to be a valid UUID
    return this.usersService.findOne(id);
  }

  @Query(() => [User])
  async users(
    @Args('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Args('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<User[]> {
    // Automatic defaults and type conversion
    return this.usersService.findAll(page, limit);
  }

  @Query(() => [User])
  async byStatus(
    @Args('status', new ParseEnumPipe(UserStatus)) status: UserStatus,
  ): Promise<User[]> {
    return this.usersService.findByStatus(status);
  }
}

// Custom pipe for business logic
@Injectable()
export class ParseDatePipe implements PipeTransform<string, Date> {
  transform(value: string): Date {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return date;
  }
}

@Query(() => [Report])
async reports(
  @Args('from', ParseDatePipe) from: Date,
  @Args('to', ParseDatePipe) to: Date,
): Promise<Report[]> {
  return this.reportsService.findBetween(from, to);
}

// Custom transformation pipes
@Injectable()
export class NormalizeEmailPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value;
    return value.trim().toLowerCase();
  }
}

// Parse comma-separated values
@Injectable()
export class ParseArrayPipe implements PipeTransform<string, string[]> {
  transform(value: string): string[] {
    if (!value) return [];
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
}

@Query(() => [Product])
async products(
  @Args('ids', ParseArrayPipe) ids: string[],
  @Args('email', NormalizeEmailPipe) email: string,
): Promise<Product[]> {
  return this.productsService.findByIds(ids);
}

// Sanitize HTML input
@Injectable()
export class SanitizeHtmlPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value;
    return sanitizeHtml(value, { allowedTags: [] });
  }
}

// Global validation pipe with transformation
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip non-DTO properties
    transform: true, // Auto-transform to DTO types
    transformOptions: {
      enableImplicitConversion: true, // Convert query strings to numbers
    },
    forbidNonWhitelisted: true, // Throw on extra properties
  }),
);

// Input type with transformation decorators
@InputType()
export class FindProductsInput {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value?.split(','))
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

@Query(() => [Product])
async products(@Args('input') input: FindProductsInput): Promise<Product[]> {
  // input is already transformed and validated
  return this.productsService.findAll(input);
}

// Pipe error customization
@Injectable()
export class CustomParseIntPipe extends ParseIntPipe {
  constructor() {
    super({
      exceptionFactory: (error) =>
        new BadRequestException(`${error} must be a valid integer`),
    });
  }
}

// Or use options on built-in pipes
@Query(() => Item)
async item(
  @Args(
    'id',
    new ParseIntPipe({
      errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE,
      exceptionFactory: () => new NotAcceptableException('ID must be numeric'),
    }),
  )
  id: number,
): Promise<Item> {
  return this.itemsService.findOne(id);
}
```

Apply pipes at the resolver class level:
```typescript
@Resolver(() => User)
@UsePipes(ValidationPipe)
export class UsersResolver {
  // All resolver methods now have ValidationPipe applied
}
```

Reference: [NestJS Pipes](https://docs.nestjs.com/pipes) | [GraphQL Resolvers - Validation](https://docs.nestjs.com/graphql/resolvers)
