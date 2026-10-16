---
title: Use Pipes for Input Transformation
impact: MEDIUM
impactDescription: Pipes ensure clean, validated data reaches your resolvers
tags: graphql, pipes, validation, transformation
---

## Use Pipes for Input Transformation

Use built-in pipes like `ParseIntPipe`, `ParseUUIDPipe`, and `DefaultValuePipe` for common transformations. Create custom pipes for business-specific transformations. Pipes separate validation/transformation logic from resolvers. Pipes work identically in GraphQL resolvers via `@UsePipes()` decorator. When several arguments form a group (pagination, filters, sorting), put them on an `@ArgsType()` class and let the `ValidationPipe` transform it — do not scatter raw `@Args()` scalars.

**Incorrect (manual type parsing in resolvers):**

```typescript
// Manual type parsing in resolvers
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => User)
  async user(@Args('id') id: string): Promise<User> {
    // Manual validation in every resolver
    const uuid = id.trim();
    if (!isUUID(uuid)) {
      throw new BadRequestException('Invalid UUID');
    }
    return this.usersService.findOne(uuid);
  }

  @Query(() => [Product])
  async search(@Args('price') price: string): Promise<Product[]> {
    const priceNum = +price; // NaN if invalid, no error
    return this.productsService.findByPrice(priceNum);
  }
}
```

**Correct (use built-in and custom pipes):**

```typescript
// Use built-in pipes for common transformations
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => User)
  async user(@Args('id', ParseUUIDPipe) id: string): Promise<User> {
    // id is guaranteed to be a valid UUID
    return this.usersService.findOne(id);
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

// Custom transformation pipe
@Injectable()
export class NormalizeEmailPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value;
    return value.trim().toLowerCase();
  }
}

@Query(() => [Product])
async products(
  @Args('email', NormalizeEmailPipe) email: string,
): Promise<Product[]> {
  return this.productsService.findByEmail(email);
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
      enableImplicitConversion: true,
    },
    forbidNonWhitelisted: true, // Throw on extra properties
  }),
);

// Grouped arguments with transformation decorators — an @ArgsType(), never an @InputType()
@ArgsType()
export class FindProductsArgs {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @Field({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsString()
  search?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

@Query(() => [Product])
async products(@Args() args: FindProductsArgs): Promise<Product[]> {
  // args is already transformed and validated
  return this.productsService.findAll(args);
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
export class UsersQueryResolver {
  // All resolver methods now have ValidationPipe applied
}
```

Reference: [NestJS Pipes](https://docs.nestjs.com/pipes) | [GraphQL Resolvers - Validation](https://docs.nestjs.com/graphql/resolvers)
