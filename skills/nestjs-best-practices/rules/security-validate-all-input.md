---
title: Validate All Input with Input Types and Pipes
impact: HIGH
impactDescription: First line of defense against attacks
tags: graphql, validation, input-type, args-type, pipes
---

## Validate All Input with Input Types and Pipes

Always validate incoming data using class-validator decorators on GraphQL inputs and the global ValidationPipe. Never trust user input. Validate all mutation inputs, query arguments, and field arguments before processing. In GraphQL, use `@InputType()` for inputs and `@ArgsType()` for grouped arguments — never one in place of the other — instead of `@Body()` DTOs.

**Incorrect (trust raw input without validation):**

```typescript
// Trust raw input without validation
@Resolver(() => User)
export class UsersMutationResolver {
  @Mutation(() => User)
  createUser(@Args('input') input: any) {
    // input could contain anything - SQL injection, XSS, etc.
    return this.usersService.create(input);
  }

  @Query(() => [User])
  users(@Args('limit') limit: any) {
    // limit could be "'; DROP TABLE users; --"
    return this.usersService.findAll(limit);
  }
}

// Input types without validation decorators
@InputType()
export class CreateUserInput {
  @Field()
  name: string;    // No validation

  @Field()
  email: string;   // Could be "not-an-email"

  @Field()
  age: number;     // Could be "abc" or -999
}
```

**Correct (validated inputs and args with global ValidationPipe):**

```typescript
// Enable ValidationPipe globally in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Strip unknown properties
      forbidNonWhitelisted: true,   // Throw on unknown properties
      transform: true,              // Auto-transform to input types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

// Create well-validated input types
import {
  IsString,
  IsEmail,
  IsInt,
  Min,
  Max,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// dto/create-user.input.ts
@InputType()
export class CreateUserInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @Field()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @Field()
  @IsInt()
  @Min(0)
  @Max(150)
  age: number;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase, and number',
  })
  password: string;
}

// dto/find-users.args.ts — query arguments are an @ArgsType(), never an @InputType()
@ArgsType()
export class FindUsersArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

// dto/find-user.args.ts — a single-argument group is still an @ArgsType()
@ArgsType()
export class FindUserArgs {
  @Field()
  @IsUUID('4')
  id: string;
}

// modules/users/resolvers/users.mutation.resolver.ts
@Resolver(() => User)
export class UsersMutationResolver {
  @Mutation(() => User)
  createUser(@Args('input') input: CreateUserInput): Promise<User> {
    // input is guaranteed to be valid
    return this.usersService.create(input);
  }
}

// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => [User])
  users(@Args() args: FindUsersArgs): Promise<User[]> {
    // args.limit is a number, args.search is sanitized
    return this.usersService.findAll(args);
  }

  @Query(() => User)
  user(@Args() args: FindUserArgs): Promise<User> {
    // args.id is a valid UUID
    return this.usersService.findById(args.id);
  }
}
```

Reference: [NestJS Validation](https://docs.nestjs.com/techniques/validation) | [GraphQL Resolvers - Validation](https://docs.nestjs.com/graphql/resolvers)
