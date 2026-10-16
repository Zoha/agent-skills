---
title: Paginate List Queries with a Shared Page Type
impact: HIGH
impactDescription: one cursor-connection pattern for every list
tags: graphql, pagination, cursor, relay
---

## Paginate List Queries with a Shared Page Type

**Impact: HIGH (one cursor-connection pattern for every list)**

**Purpose.** Every list query needs pagination. GraphQL's recommended pattern is cursor-based
pagination ("connections"): a `first`/`after` args type plus an edge/node/`pageInfo` result type.
Define the shared building blocks once in `common/pagination/` — a generic `Paginated<T>` factory
and a `PageInfo` type — and reuse them for every list; keep a feature's own args and filter types
in its `dto/`. `PageInfo` follows the Relay Cursor Connections spec: nullable `startCursor`/`endCursor`
and required `hasPreviousPage`/`hasNextPage`. A `totalCount` field is an **optional, non-Relay
extension** — include it only when it can be computed cheaply. For a small, bounded, non-growing
admin list offset (`page`/`limit`) is acceptable; pick one per query and do not mix the two.

**Placement.**

- Shared: `src/common/pagination/paginated.ts` (the generic `Paginated<T>` factory and
  `PageInfo`).
- Feature args/filters: `modules/<feature>/dto/<feature>-pagination.args.ts`,
  `filter-<feature>.input.ts`.

**Responsibilities.**

- Define the generic `Paginated<T>` connection factory once, in `common/pagination/`.
- Give each list query an `@ArgsType()` with `first`/`after` (and filters) in the feature's `dto/`.
- Return a `Paginated<T>` from the query and build it from the service result.
- Include `totalCount` only when it is cheap to compute — it is an optional, non-Relay extension.

**Never.**

- Return a bare `[Item]` array from a list query that can grow.
- Re-implement an edge/`pageInfo` type per feature — import the shared factory.
- Mix offset (`page`/`limit`) and cursor (`first`/`after`) on the same query.

**Incorrect (bare array, unbounded and unpaged):**

```typescript
@Query(() => [User])
users() {
  return this.usersService.findAll(); // grows without limit, no way to page
}
```

Why it is wrong: the list is unbounded and the client has no cursor or page to move through it.

**Correct (shared connection factory, feature args, paged result):**

```typescript
// common/pagination/paginated.ts — defined once for the whole app
@ObjectType('PageInfo')
export class PageInfo {
  @Field(() => String, { nullable: true })
  startCursor?: string;

  @Field(() => String, { nullable: true })
  endCursor?: string;

  @Field()
  hasPreviousPage: boolean;

  @Field()
  hasNextPage: boolean;
}

export function Paginated<T>(classRef: Type<T>) {
  @ObjectType(`${classRef.name}Edge`)
  abstract class EdgeType {
    @Field(() => String)
    cursor: string;

    @Field(() => classRef)
    node: T;
  }

  @ObjectType({ isAbstract: true })
  abstract class PaginatedType {
    @Field(() => [EdgeType])
    edges: EdgeType[];

    @Field(() => PageInfo)
    pageInfo: PageInfo;

    // OPTIONAL, non-Relay extension: include only when totalCount is cheap to compute.
    @Field(() => Int, { nullable: true })
    totalCount?: number;
  }

  return PaginatedType;
}

// modules/users/models/user.model.ts — one connection type per list item
@ObjectType()
export class UserConnection extends Paginated(User) {}

// modules/users/dto/users-pagination.args.ts
@ArgsType()
export class UsersPaginationArgs {
  @Field(() => Int, { defaultValue: 20 })
  @IsInt() @Min(1) @Max(100)
  first = 20;

  @Field({ nullable: true })
  @IsOptional() @IsString()
  after?: string;

  @Field({ nullable: true })
  @IsOptional() @IsString() @MaxLength(100)
  search?: string;
}

// modules/users/resolvers/users.query.resolver.ts
@Query(() => UserConnection)
users(@Args() args: UsersPaginationArgs): Promise<UserConnection> {
  return this.usersService.search(args);
}
```

Why it is right: one cursor-connection shape is defined once and reused, the args and filters live
with the feature that owns them, and every list query pages the same way.

When to use offset instead: a small, bounded, non-growing list where `page`/`limit` is simpler.
Choose per query and stay consistent within it; see `type-args` for the offset-style args shape.

Reference: [GraphQL Pagination](https://graphql.org/learn/pagination/) | [Relay Cursor Connections](https://relay.dev/graphql/connections.htm) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
