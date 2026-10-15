---
title: Resolve Relations with @ResolveField
impact: CRITICAL
impactDescription: resolve relations on demand, in the module that owns the data
tags: graphql, resolvefield, relations
---

## Resolve Relations with @ResolveField

**Impact: CRITICAL (resolve relations on demand, in the module that owns the data)**

**Purpose.** A relation field (`User.comments`, `User.orders`) is resolved with an
`@ResolveField` method, on demand, only when the client requests it — never by eager-loading. Per
`relations-owning-module`, that resolver lives in the module that owns the returned data and
extends the other module's type.

**Placement.** `<data-owner>/resolvers/<type>-<feature>.resolver.ts`, for example
`comments/resolvers/user-comments.resolver.ts`. The method name matches the GraphQL field.

**Responsibilities.**

- Declare `@Resolver(() => ExtendedType)` for the type being extended.
- Read the parent key with `@Parent()`.
- Delegate to the module's own service (or a loader — see `relations-dataloader`).

**Never.**

- Eager-load every relation in the query resolver.
- Query once per parent without batching (that is N+1 — see `relations-dataloader`).
- Declare the field in the type's own module when the data lives elsewhere (see
  `relations-owning-module`).
- Reach into another module's repository, entity, or model.

**Incorrect (every relation eager-loaded for every query):**

```typescript
@Query(() => User)
async user(@Args('id') id: string) {
  return this.userModel
    .findById(id)
    .populate(['orders', 'comments', 'followers']); // loads all, asked or not
}
```

Why it is wrong: the query does work the client did not request and pays for it on every call.

**Correct (extension resolver in the data-owning module, resolved on demand):**

```typescript
// comments/resolvers/user-comments.resolver.ts
@Resolver(() => User)
export class UserCommentsResolver {
  constructor(private readonly commentsService: CommentsService) {}

  @ResolveField(() => [Comment])
  comments(@Parent() user: User): Promise<Comment[]> {
    return this.commentsService.findByUserId(user.id);
  }
}
```

Why it is right: the field is resolved only when asked, from the parent already in hand, by the
module that owns comments — and it uses that module's own service.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

**Behavioral depth.** See `nestjs-best-practices` -> `db-avoid-n-plus-one`.
