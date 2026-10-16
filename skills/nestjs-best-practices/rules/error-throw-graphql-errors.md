---
title: Throw Domain Errors from Services
impact: HIGH
impactDescription: Keeps resolvers thin and simplifies error handling
tags: graphql, errors, exceptions, services
---

## Throw Domain Errors from Services

Services communicate error states by throwing, which keeps resolvers thin and puts error handling in one place. Throw a typed **domain exception** from the service and let a central exception filter map it to a `GraphQLError` with `extensions`. Each exception is its own file under `exceptions/`, extending the shared `DomainException` — never define an exception class inline in a service, and never build the GraphQL error shape inside the service.

**Incorrect (return error objects instead of throwing):**

```typescript
// Return error objects instead of throwing
@Injectable()
export class UsersService {
  async findById(id: string): Promise<{ user?: User; error?: string }> {
    const user = await this.repo.findById(id);
    if (!user) {
      return { error: 'User not found' }; // Resolver must check this
    }
    return { user };
  }
}
```

**Incorrect (GraphQL error shape built inside the service, exception declared inline):**

```typescript
// The service now knows about GraphQL, and the exception has no home
@Injectable()
export class UsersService {
  async findById(id: string): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new GraphQLError(`User #${id} not found`, {
        extensions: { code: 'USER_NOT_FOUND' }, // transport detail leaks into business code
      });
    }
    return user;
  }
}

class EntityNotFoundError extends Error {} // declared inline — no file, cannot be reused or filtered
```

**Correct (typed domain exception, one file, mapped by a central filter):**

```typescript
// common/exceptions/domain.exception.ts — the shared base
export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

// modules/users/exceptions/user-not-found.exception.ts — feature-local, one file
export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(`User #${id} not found`, 'USER_NOT_FOUND');
  }
}

// modules/users/services/users.service.ts — imports and throws the domain exception
import { UserNotFoundException } from '../exceptions/user-not-found.exception';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new UserNotFoundException(id);
    }
    return user;
  }

  async create(dto: CreateUserInput): Promise<User> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new EmailAlreadyRegisteredException(dto.email);
    }
    return this.usersRepository.create(dto);
  }

  async update(id: string, dto: UpdateUserInput): Promise<User> {
    const user = await this.findById(id); // Throws if not found
    return this.usersRepository.update(id, { ...user, ...dto });
  }
}

// Resolver stays thin — no try/catch, no GraphQL error construction
// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User)
  user(@Args() args: FindUserArgs): Promise<User> {
    return this.usersService.findById(args.id);
  }
}
```

The mapping from domain exception to GraphQL error happens once, in an exception filter (see `error-use-exception-filters`), so error codes and `extensions` are consistent across the whole API.

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters) | [GraphQL Error Handling](https://graphql.org/learn/serving-over-http/#errors)
