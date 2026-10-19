---
title: Enforce Depth as a Validation Rule, Before Execution
impact: CRITICAL
impactDescription: a nested document must be rejected before a single resolver runs
tags: depth-limit, validation-rules, apollo, dos
---

## Enforce Depth as a Validation Rule, Before Execution

**Impact: CRITICAL (a nested document must be rejected before a single resolver runs)**

Depth is the cheapest hostile move against GraphQL: a query nested a dozen levels over lists multiplies
into exponential work, and a per-field rate limit does not stop it because every field is individually
allowed. Cap depth as a **validation rule** so the document is rejected during validation — before any
resolver, before any DataLoader, before any database work.

**Incorrect (no depth limit, or a "complexity guard" that runs inside a resolver):**

```typescript
@Injectable()
export class ComplexityGuard implements CanActivate {   // runs per resolver field, after validation
  canActivate(context: ExecutionContext): boolean {
    const info = GqlExecutionContext.create(context).getInfo();
    return this.depthOf(info.fieldNodes) <= 10;          // the nested bomb is already executing
  }
}
```

Why it is wrong: by the time a guard or resolver runs, validation has passed and execution has begun,
so the expensive path is already in flight.

**Correct (register the depth rule with the driver, so it runs with validation):**

```typescript
// infra/graphql/graphql.module.ts
import depthLimit from 'graphql-depth-limit';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  validationRules: [
    depthLimit(10),                       // 10 levels; introspection fields are ignored by default
    createComplexityRule({ /* see `op-cost-based-limits` */ }),
  ],
});
```

Why it is right: the depth check is part of document validation, so a hostile document never reaches
execution, and introspection (used by tooling) is not penalised by default.

Two things to verify against your locked stack (see `driver-version-pinning`):

- **Where the option is honoured.** `@nestjs/apollo` forwards `validationRules` to the underlying
  `ApolloServer`; confirm your installed `ApolloDriverConfig` type accepts it. If it does not (or you
  are on another driver), do the identical check in an Apollo plugin's `didResolveOperation` with
  `validate(schema, document, [...specifiedRules, rule])` — the rule is the same, only the host hook
  differs. Do **not** reach for Apollo Server v2/v3's removed `buildSchema({ validationRules })`.
- **Your real client depth.** Set the limit above your deepest legitimate query (measure it), not at a
  round number you guessed — an over-tight depth that rejects a valid screen is an outage.

Layer with the others rather than replacing them: depth is a **ceiling**, the operation limit is the
**rate** (`op-limit-layers`), and breadth (`depth-breadth-aliases`) and self-reference
(`depth-self-referential`) are separate dimensions of the same document.

Reference: [graphql-depth-limit](https://www.npmjs.com/package/graphql-depth-limit) | [Apollo Server plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)
