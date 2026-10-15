---
title: Split Resolvers by Role into resolvers/
impact: HIGH
impactDescription: thin, role-focused entry points
tags: graphql, resolver, organization
---

## Split Resolvers by Role into resolvers/

**Impact: HIGH (thin, role-focused entry points)**

**Purpose.** Resolvers are the GraphQL entry points of a feature and live in its `resolvers/`
folder. Each resolver targets one type and one role — queries, mutations, or field relations
— stays thin, and delegates to services. Splitting by role keeps each file small and the
module's provider list readable.

**Placement.** `modules/<feature>/resolvers/<feature>.query.resolver.ts`,
`<feature>.mutation.resolver.ts`, `<feature>.field.resolver.ts`. For a very small feature a
single `<feature>.resolver.ts` covering queries and mutations is acceptable; split once a role
grows.

**Responsibilities.**

- Declare `@Query()`, `@Mutation()`, or `@ResolveField()` methods for one parent type.
- Translate arguments into service calls and return the result.
- Declare the parent type with `@Resolver(() => Feature)`.

**Never.**

- Contain business logic or direct model/repository access.
- Catch and reformat errors by hand — use exception filters.
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

Why it is wrong: one file owns every type, mixes layers, and declares no parent type, so
field resolvers have nowhere to live.

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

Why it is right: each file is one type and one role, resolvers only translate and delegate,
and the parent type is declared once per class so field resolvers can attach.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
