---
title: Throw GraphQL Errors from Services
impact: HIGH
impactDescription: Keeps resolvers thin and simplifies error handling
tags: graphql, errors, exceptions, services
---

## Throw GraphQL Errors from Services

Throw `GraphQLError` from services to communicate error states in GraphQL. Use `extensions` for error codes and metadata. This keeps resolvers thin and allows services to communicate appropriate error states. For layer-agnostic services, use domain exceptions that map to GraphQL errors.

**Incorrect (return error objects instead of throwing):**

```typescript
// Return error objects instead of throwing
@Injectable()
export class UsersService {
  async findById(id: string): Promise<{ user?: User; error?: string }> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      return { error: 'User not found' }; // Resolver must check this
    }
    return { user };
  }
}

@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  async user(@Args('id') id: string) {
    const result = await this.usersService.findById(id);
    if (result.error) {
      throw new GraphQLError(result.error);
    }
    return result.user;
  }
}
```

**Correct (throw GraphQL errors directly from service):**

```typescript
// Throw GraphQL errors directly from service
import { GraphQLError } from 'graphql';

@Injectable()
export class UsersService {
  constructor(private readonly repo: UserRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new GraphQLError(`User #${id} not found`, {
        extensions: {
          code: 'USER_NOT_FOUND',
          http: { status: 404 },
        },
      });
    }
    return user;
  }

  async create(dto: CreateUserInput): Promise<User> {
    const existing = await this.repo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new GraphQLError('Email already registered', {
        extensions: {
          code: 'CONFLICT',
          http: { status: 409 },
        },
      });
    }
    return this.repo.save(dto);
  }

  async update(id: string, dto: UpdateUserInput): Promise<User> {
    const user = await this.findById(id); // Throws if not found
    Object.assign(user, dto);
    return this.repo.save(user);
  }
}

// Resolver stays thin
@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  user(@Args('id') id: string): Promise<User> {
    return this.usersService.findById(id);
  }

  @Mutation(() => User)
  createUser(@Args('input') input: CreateUserInput): Promise<User> {
    return this.usersService.create(input);
  }
}

// For layer-agnostic services, use domain exceptions
export class EntityNotFoundError extends Error {
  constructor(
    public readonly entity: string,
    public readonly id: string,
  ) {
    super(`${entity} with ID "${id}" not found`);
  }
}

// Map to GraphQL error in exception filter
@Catch(EntityNotFoundError)
export class EntityNotFoundFilter implements ExceptionFilter {
  catch(exception: EntityNotFoundError, host: ArgumentsHost) {
    throw new GraphQLError(exception.message, {
      extensions: {
        code: 'ENTITY_NOT_FOUND',
        entity: exception.entity,
        id: exception.id,
        http: { status: 404 },
      },
    });
  }
}

// Common GraphQL error patterns
@Injectable()
export class UsersService {
  async findById(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new GraphQLError(`User #${id} not found`, {
        extensions: {
          code: 'BAD_USER_INPUT',
          http: { status: 400 },
        },
      });
    }
    return user;
  }

  async delete(id: string): Promise<void> {
    const user = await this.findById(id);
    if (user.isAdmin) {
      throw new GraphQLError('Cannot delete admin users', {
        extensions: {
          code: 'FORBIDDEN',
          http: { status: 403 },
        },
      });
    }
    await this.repo.delete(id);
  }
}
```

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters) | [GraphQL Error Handling](https://graphql.org/learn/serving-over-http/#errors)
