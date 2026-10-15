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
`@ResolveField`), using B's own service. B may import A only to reference A's type; A never
imports B. The module that owns the extra data owns the field, so module and service dependencies
stay one-directional and no cycle or `forwardRef` is ever needed — even though the GraphQL types
reference each other in both directions.

**Placement.** `<data-owner>/resolvers/<type>-<feature>.resolver.ts` (for example
`comments/resolvers/user-comments.resolver.ts`).

**MUST.**

- Put the resolver in the module that owns the data the field returns.
- Declare it `@Resolver(() => OtherType)` with a `@ResolveField(() => FieldType)` method.
- Read the parent key from `@Parent()` and call the module's **own** service.
- Keep every dependency pointing data-owner → type-owner.

**MUST NOT.**

- Add the relation field inside the type's own module when that requires importing the module
  that owns the data.
- Import the data-owner module from the type-owner module.
- Reach into another module's repository, entity, or model.
- Use `forwardRef` to make a relation field resolve.

**Decision question.** *I need field X on type T — where does the data come from? Put the
resolver in that module.*

**Good / bad — `User.comments`:**

```typescript
// BAD — the type's own module imports the data owner to resolve User.comments
// users/resolvers/users.field.resolver.ts
@Resolver(() => User)
export class UsersFieldResolver {
  constructor(private readonly commentsService: CommentsService) {} // UsersModule now imports CommentsModule
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user.id);
  }
}
// A cycle appears the moment CommentsModule needs anything from UsersModule.
```

```typescript
// GOOD — the data owner owns the field and extends User
// comments/resolvers/user-comments.resolver.ts
@Resolver(() => User)                                   // A's type, imported as a class
export class UserCommentsResolver {
  constructor(private readonly commentsService: CommentsService) {} // its own service
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user.id);
  }
}
// CommentsModule imports UsersModule only to reference User.
// UsersModule knows nothing about comments. Dependencies point one way -> no cycle, no forwardRef.
```

**PR checklist.**

- [ ] The relation field's resolver lives in the module that owns the returned data.
- [ ] The resolver uses that module's own service, not another module's.
- [ ] No type-owner module imports the data-owner module.
- [ ] No `forwardRef` was added to make the field resolve.
- [ ] `@Parent()` supplies the key; the parent is not re-fetched to find it.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency)
