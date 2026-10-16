---
title: Define @Args Classes in dto/
impact: HIGH
impactDescription: group and validate operation arguments
tags: graphql, args, dto
---

## Define @Args Classes in dto/

**Impact: HIGH (group and validate operation arguments)**

**Purpose.** When an operation takes more than one or two arguments, or the arguments form a
logical group (pagination, filters, sorting), define an `@ArgsType()` class in the feature's
`dto/` folder instead of a list of raw `@Args('x')` scalars. It groups and validates the
arguments the same way `@InputType` does for inputs.

**Placement.** `modules/<feature>/dto/find-<feature>.args.ts`. Class names end in `Args`.

**Responsibilities.**

- Group related arguments on one `@ArgsType()` class.
- Validate each field with `class-validator`.
- Supply sensible defaults (for example page or limit).

**Never.**

- Scatter many raw `@Args('field')` scalars across a resolver.
- Accept unvalidated filter or sort strings straight from the client.
- Reuse an `@InputType` class as an args type (or vice versa) just to avoid a file.

**Incorrect (raw, unvalidated arguments):**

```typescript
@Query(() => [User])
users(
  @Args('search') search: string,
  @Args('page') page: number,
  @Args('limit') limit: number,
  @Args('sort') sort: string,
) {
  // every argument raw and unvalidated, defaults are ad hoc
  return this.usersService.findAll({ search, page, limit, sort });
}
```

Why it is wrong: argument handling is repeated in every resolver, nothing is validated, and
paging defaults are handled per call site.

**Correct (one validated args type, defaults included):**

```typescript
// dto/find-users.args.ts
@ArgsType()
export class FindUsersArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString() @MaxLength(100)
  search?: string;

  @Field(() => Int, { defaultValue: 1 })
  @Type(() => Number)
  @IsInt() @Min(1)
  page = 1;

  @Field(() => Int, { defaultValue: 20 })
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limit = 20;
}

@Query(() => [User])
users(@Args() args: FindUsersArgs) {
  return this.usersService.findAll(args);
}
```

Why it is right: the argument group is one validated, reusable, named type with sensible
defaults, and the resolver stays a one-line translation.

For a list query that can grow, prefer cursor arguments (`first`/`after`) — see `type-pagination`.
The `page`/`limit` shape above is the offset alternative, kept for small, bounded lists.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
