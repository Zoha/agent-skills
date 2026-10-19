---
title: Give Expensive Fields an Explicit Cost
impact: HIGH
impactDescription: the default cost of 1 hides the fields that actually cost money
tags: cost, field, directive, complexity
---

## Give Expensive Fields an Explicit Cost

**Impact: HIGH (the default cost of 1 hides the fields that actually cost money)**

Every field defaults to cost 1, which says a scalar lookup and a full-text search cost the same. They
do not. Price the genuinely expensive fields explicitly, **next to the field**, so the cost model and
the code cannot drift: a reviewer sees the price where the work happens.

`graphql-query-complexity` reads cost from either a field extension or a `@complexity` **directive**.
In code-first NestJS the directive is the clean path — declare it once and annotate fields.

**Incorrect (one flat default, so search costs the same as `id`):**

```typescript
validationRules: [
  createComplexityRule({ maximumComplexity: 1000, estimators: [simpleEstimator({ defaultComplexity: 1 })] }),
];

// in the schema — every field is priced 1, including this one
@Query(() => [Result])
search(@Args('term') term: string) { /* a full-text scan over millions of rows */ }
```

Why it is wrong: a query that calls `search` five times costs 5, the same as five `id` lookups, so the
ceiling never reflects real load.

**Correct (a `@complexity` directive, priced at the field):**

```typescript
// common/directives/complexity.directive.ts — declared once, registered in buildSchemaOptions
export const ComplexityDirective = Directive('@complexity(value: Int!, multipliers: [String!])');
```

```typescript
// infra/graphql/graphql.module.ts — the estimator chain, most specific first
import { createComplexityRule, directiveEstimator, simpleEstimator } from 'graphql-query-complexity';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  buildSchemaOptions: { directives: [ComplexityDirective] },   // AS5: declare it yourself
  validationRules: [
    createComplexityRule({
      maximumComplexity: 1000,
      estimators: [
        directiveEstimator(),                          // reads @complexity, if present
        simpleEstimator({ defaultComplexity: 1 }),     // everything else costs 1
      ],
    }),
  ],
});
```

```typescript
// the expensive field declares its own price, in the same file as the field
@Query(() => [Result])
@ComplexityDirective({ value: 25 })      // a search costs 25 units
search(@Args('term') term: string) { /* ... */ }
```

Why it is right: the price lives with the field, the estimator chain falls back to 1 for everything
unpriced, and the ceiling and the budget (`op-cost-based-limits`) read the same number.

Rules of thumb:

- **One estimator chain, used everywhere.** The validation ceiling and the budget charge must read the
  same cost; two chains is the classic "rejected by one rule, under-charged by the other" bug.
- **Price by the real bottleneck.** Cost approximates database/upstream work, so an aggregate, a
  cross-service join or an external API call is priced high; an indexed id lookup can even be priced
  below 1 if the estimator supports fractional values.
- **Do not price everything.** A field with no annotation falls back to the default; annotate only the
  fields where the default is a lie.
- **Verify the exported estimator names** against your pinned `graphql-query-complexity` version — the
  package has moved through forks, and `directiveEstimator` / `fieldExtensionsEstimator` are not
  guaranteed to each exist in every version (see `driver-version-pinning`).

Reference: [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) | [Apollo `@cacheControl` directives](https://www.apollographql.com/docs/apollo-server/performance/caching/)
