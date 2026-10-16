---
title: Place Union and Interface Types with the Module's Types
impact: MEDIUM-HIGH
impactDescription: polymorphic types have one home and one resolveType
tags: graphql, union, interface, resolveType
---

## Place Union and Interface Types with the Module's Types

**Impact: MEDIUM-HIGH (polymorphic types have one home and one resolveType)**

**Purpose.** Abstract GraphQL types — interfaces and unions — are declared in code-first NestJS
with `@InterfaceType()` or `createUnionType()`. They are GraphQL-only types, so they live with the
module's other GraphQL types (`models/` in the split case, or `entities/` in the merged case), and
their `resolveType` is implemented in one place. They are not put in `common/` and not re-declared
per resolver.

**Placement.** `modules/<feature>/models/<name>.interface.ts` and `models/<name>.union.ts` (or the
module's type folder in the merged case). The `resolveType` implementation lives with the type —
in `models/` for the union/interface, or in `resolvers/<name>.resolver.ts` when it needs a service.

**Responsibilities.**

- Declare each interface or union once, in the module that owns the types it groups.
- Implement `resolveType` centrally, in one place.
- Keep the concrete `@ObjectType`s in the same module.

**Never.**

- Declare a union or interface inline inside a query resolver.
- Put a feature's union or interface in `common/` — that couples `common/` to a feature.
- Re-implement `resolveType` in more than one place.

**Incorrect (union declared inline, resolveType scattered):**

```typescript
// modules/search/resolvers/search.query.resolver.ts
const SearchResult = createUnionType({ name: 'SearchResult', types: () => [User, Post] });

@Query(() => [SearchResult])
search() { /* ... */ }
// resolveType handled ad hoc in several resolvers
```

Why it is wrong: the union has no stable home, so it is rebuilt wherever it is needed and the
`resolveType` logic drifts.

**Correct (declared once with the module's types, resolved in one place):**

```typescript
// modules/search/models/search-result.union.ts
export const SearchResult = createUnionType({
  name: 'SearchResult',
  types: () => [User, Post] as const,
  resolveType: (value) => (value.kind === 'user' ? User : Post),
});

// modules/search/models/searchable.interface.ts
@InterfaceType({ resolveType: (value) => (value.kind === 'user' ? User : Post) })
export abstract class Searchable {
  @Field(() => ID)
  id: string;
}

// modules/search/resolvers/search.query.resolver.ts — just uses it
@Query(() => [SearchResult])
search(@Args() args: SearchArgs): Promise<SearchResult[]> {
  return this.searchService.search(args);
}
```

Why it is right: the polymorphic type has one home and one `resolveType`, and the concrete types
sit beside it in the same module.

Reference: [NestJS GraphQL Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums) | [NestJS GraphQL Interfaces](https://docs.nestjs.com/graphql/interfaces)
