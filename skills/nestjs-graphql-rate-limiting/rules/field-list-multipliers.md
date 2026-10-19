---
title: Multiply List Cost by the Requested Page Size
impact: HIGH
impactDescription: an unbounded list is the cheapest way to amplify one field
tags: cost, lists, pagination, multipliers
---

## Multiply List Cost by the Requested Page Size

**Impact: HIGH (an unbounded list is the cheapest way to amplify one field)**

A list field's cost is not constant — it scales with how many items the client asks for. A static cost
of 1 for `search(first: 10000)` makes the ceiling meaningless. Multiply the field's base cost by the
argument that controls the page size, and cap that argument independently.

**Incorrect (static cost, unbounded page size):**

```typescript
@Query(() => ResultConnection, { complexity: 10 })     // 10, whether `first` is 1 or 10 000
search(@Args('first', { type: () => Int }) first: number) { /* fetches `first` rows */ }
```

Why it is wrong: the same cost is charged for a page of 10 and a page of 10 000, so the client simply
asks for the biggest page and the ceiling never fires.

**Correct (a multiplier on the page-size argument, plus a hard cap):**

```typescript
// the field's cost is base x first:  @complexity(value, multipliers)
@Query(() => ResultConnection)
@ComplexityDirective({ value: 10, multipliers: ['first'] })   // cost = 10 x first
search(
  @Args() args: SearchArgs,          // `first` clamped to a hard maximum
) { /* ... */ }
```

```typescript
// dto/search.args.ts — the cap the multiplier relies on
@ArgsType()
export class SearchArgs {
  @Field(() => Int, { defaultValue: 20 })
  @IsInt() @Min(1) @Max(100)         // a page can never exceed 100 -> cost can never exceed 1000
  first = 20;

  @Field({ nullable: true })
  @IsOptional() @IsString() @MaxLength(200)
  after?: string;
}
```

Why it is right: cost tracks the work (`first` items), and the input validation caps `first`, so the
worst-case cost of the field is bounded and known — `100 × 10 = 1000`.

Rules of thumb:

- **Cap first, then multiply.** The multiplier alone is not enough: without `@Max`, `first: 999999`
  makes one field cost more than the whole budget and turns a fair limit into a denial-of-service by
  itself.
- **Match the multiplier to the argument names** the field actually exposes (`first`, `limit`, `take`);
  a multiplier on an argument that does not exist silently does nothing.
- **Cursor pagination is the default** for any list that can grow (see `type-pagination` in the
  `nestjs-graphql-structure` skill); the cap is a backstop, not a substitute for paginating.
- **Nested lists multiply again.** `boards { cards(first: 100) }` costs roughly `cards × boards`; either
  bound the parent list too, or rely on the depth cap (`depth-validation-rule`) and the default cost of
  the parent field to keep the product sane.

Reference: [GraphQL pagination](https://graphql.org/learn/pagination/) | [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity)
