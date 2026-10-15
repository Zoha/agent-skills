---
title: Put a Relation Field in the Module That Owns Its Data
impact: CRITICAL
impactDescription: one-directional module dependencies; no forwardRef
tags: relations, modules, resolvefield, ownership
---

## Put a Relation Field in the Module That Owns Its Data

**Impact: CRITICAL (one-directional module dependencies; no forwardRef)**

When a type from module A needs a field whose data comes from module B, the field is **not**
added in A. It is added in **B**, as an extension resolver on A's type (`@Resolver(() => A)` +
`@ResolveField`), using B's own service. B imports A's type class (and A's module only if it also
injects A's service); A never imports B. The module that owns the extra data owns the field, so
module and service dependencies stay one-directional and no cycle or `forwardRef` is ever needed —
even though the GraphQL types reference each other in both directions.

**Placement.** `<data-owner>/resolvers/<type>-<feature>.resolver.ts` (for example
`comments/resolvers/user-comments.resolver.ts`). The same file belongs to the data owner, never to
the type's own module.

**MUST.**

- Put the resolver in the module that owns the data the field returns.
- Declare it `@Resolver(() => OtherType)` with a `@ResolveField(() => FieldType)` method.
- Read the parent key from `@Parent()` and call the module's **own** service.
- Keep every dependency pointing data-owner → type-owner.

**MUST NOT.**

- Add the relation field inside the type's own module when that requires importing the module that
  owns the data.
- Import the data-owner module from the type-owner module.
- Reach into another module's repository, entity, or model.
- Use `forwardRef` to make a relation field resolve.

**Decision question.** *I need field X on type T — where does the data come from? Put the resolver
in that module.*

**Good / bad — `User.comments`:**

```typescript
// BAD — the type's own module (users) declares and resolves User.comments
// users/resolvers/user-comments.resolver.ts   <-- belongs in comments/, not users/
@Resolver(() => User)
export class UserCommentsResolver {
  constructor(private readonly commentsService: CommentsService) {} // users now imports comments
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user._id.toString());
  }
}
// A cycle appears the moment CommentsModule needs anything from UsersModule.
```

```typescript
// GOOD — the data owner owns the field; the SAME resolver, in the correct module
// comments/resolvers/user-comments.resolver.ts
@Resolver(() => User)                                   // the User type class, imported
export class UserCommentsResolver {
  constructor(private readonly commentsService: CommentsService) {} // its own service
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user._id.toString());
  }
}
// CommentsModule imports the User class (and UsersModule only if it injects UsersService).
// UsersModule knows nothing about comments. Dependencies point one way -> no cycle, no forwardRef.
```

**PR checklist.**

- [ ] The relation field's resolver lives in the module that owns the returned data.
- [ ] The resolver uses that module's own service, not another module's.
- [ ] No type-owner module imports the data-owner module.
- [ ] No `forwardRef` was added to make the field resolve.
- [ ] `@Parent()` supplies the key; the parent is not re-fetched to find it.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency)
