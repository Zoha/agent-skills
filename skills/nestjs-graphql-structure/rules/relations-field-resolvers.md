---
title: Resolve Relations with @ResolveField
impact: CRITICAL
impactDescription: resolve relations on demand, not eagerly
tags: graphql, resolvefield, relations
---

## Resolve Relations with @ResolveField

**Impact: CRITICAL (resolve relations on demand, not eagerly)**

**Purpose.** A relation that points from one object to another (author → posts, user → orders)
is resolved with an `@ResolveField` method on the owning type's resolver, not by eager-loading
everything in the parent query. The field resolver receives the parent object via `@Parent`
and returns the related data, usually by delegating to a loader (see `relations-dataloader`).

**Placement.** `modules/<feature>/resolvers/<feature>.field.resolver.ts`. The method name
matches the GraphQL field.

**Responsibilities.**

- Declare `@ResolveField(() => [Other])` for a relational field.
- Read the parent id with `@Parent()`.
- Delegate to a loader or the owning module's service.

**Never.**

- Eager-load every relation in the query resolver.
- Query the database once per parent inside the field resolver (that is N+1 — see
  `relations-dataloader`).
- Declare the field resolver for another module's type here; the type's owner declares it.

**Incorrect (every relation eager-loaded for every query):**

```typescript
@Query(() => User)
async user(@Args('id') id: string) {
  return this.userModel
    .findById(id)
    .populate(['orders', 'posts', 'followers', 'comments']); // loads all, asked or not
}
```

Why it is wrong: the query does work the client did not request and pays for it on every call.

**Correct (resolve the field on demand, from the parent id):**

```typescript
// resolvers/users.field.resolver.ts
@Resolver(() => User)
export class UsersFieldResolver {
  constructor(private readonly ordersLoader: OrdersLoader) {}

  @ResolveField(() => [Order])
  orders(@Parent() user: User): Promise<Order[]> {
    return this.ordersLoader.loadByUserId(user._id.toString());
  }
}
```

Why it is right: the relation is resolved only when the client asks for the field, using the
parent object already in hand and a batched loader rather than a per-parent query.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
