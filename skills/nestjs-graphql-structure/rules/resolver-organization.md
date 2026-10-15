---
title: Split Resolvers by Role into resolvers/
impact: HIGH
impactDescription: thin, role-focused entry points
tags: graphql, resolver, organization
---

## Split Resolvers by Role into resolvers/

**Impact: HIGH (thin, role-focused entry points)**

**Purpose.** Entry-point resolvers (`@Query`, `@Mutation`) live in the feature's `resolvers/`
folder, split by role so each file stays small and the module's provider list stays readable. An
entry-point resolver targets one type and one role, stays thin, and delegates to services. Field
resolvers are a separate concern, living in their own per-type file (see `resolver-per-type` and
`relations-owning-module`) — not here.

**Placement.** `modules/<feature>/resolvers/<feature>.query.resolver.ts` and
`<feature>.mutation.resolver.ts`. For a very small feature a single `<feature>.resolver.ts`
covering queries and mutations is acceptable; split once a role grows.

**Responsibilities.**

- Declare `@Query()` and `@Mutation()` methods for one parent type.
- Translate arguments into service calls and return the result.
- Declare the parent type with `@Resolver(() => Feature)`.

**Never.**

- Contain business logic or direct model/repository access.
- Catch and reformat errors by hand — use exception filters.
- Hold `@ResolveField()` methods — they belong in the type's per-type resolver file (see
  `resolver-per-type`).
- Register in `AppModule`; resolvers are providers of their own feature module.

**Incorrect (one class for everything, logic inline):**

```typescript
// resolvers/app.resolver.ts
@Resolver()
export class AppResolver {
  @Query(() => User)
  async user(@Args('id') id: string) {
    const user = await this.userModel.findById(id); // data access here
    if (!user) throw new Error('not found');
    user.lastSeen = new Date();
    await user.save();                               // business logic here
    return user;
  }

  @Mutation(() => User)
  async updateUser(@Args('id') id: string, @Args('name') name: string) {
    /* more of the same */
  }
}
```

Why it is wrong: one file owns every type and mixes layers.

**Correct (role-split, thin resolvers):**

```typescript
// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User, { name: 'user' })
  async getUser(@Args('id', ParseObjectIdPipe) id: string): Promise<User> {
    return this.usersService.findById(id);
  }
}

// modules/users/resolvers/users.mutation.resolver.ts
@Resolver(() => User)
export class UsersMutationResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation(() => User, { name: 'updateUser' })
  async updateUser(@Args('input') input: UpdateUserInput): Promise<User> {
    return this.usersService.update(input);
  }
}
```

Why it is right: each file is one type and one role, and resolvers only translate and delegate.
A type's field resolvers live together in one per-type file (see `resolver-per-type`).

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
