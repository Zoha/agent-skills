---
title: Put Schema Directives in common/directives/
impact: MEDIUM
impactDescription: GraphQL schema directives differ from param decorators
tags: graphql, directives, common
---

## Put Schema Directives in common/directives/

**Impact: MEDIUM (GraphQL schema directives differ from param decorators)**

**Purpose.** A GraphQL schema directive (`@Directive()`, for example a field-level `@Auth`) is
applied to schema elements and is a different kind of thing from a parameter decorator like
`@CurrentUser()`. Directives are cross-cutting, so they live in `common/directives/`, alongside
the shared decorators but in their own folder. The directive's transformer is registered once, in
`infra/graphql/`.

**Placement.** `src/common/directives/<name>.directive.ts`. Register the directive's transformer
once in `infra/graphql/graphql.module.ts`.

**Responsibilities.**

- Hold reusable schema directives and any argument classes they take.
- Register the directive once, in the GraphQL infrastructure module.

**Never.**

- Put a schema directive in `common/decorators/` — it is a different kind of thing.
- Declare a directive inside a feature; directives are cross-cutting.
- Register the same directive's transformer in more than one place.

**Incorrect (directive buried in a feature, transformer registered locally):**

```typescript
// modules/users/directives/auth.directive.ts — a cross-cutting directive owned by one feature
export const AuthDirective = Directive('@auth');

// registered ad hoc inside the feature module
```

Why it is wrong: a cross-cutting directive has no shared home, so other features re-declare it and
its transformer gets registered more than once.

**Correct (one shared directive, registered once in infra/graphql/):**

```typescript
// common/directives/auth.directive.ts
export const AuthDirective = Directive('@auth');

// infra/graphql/graphql.module.ts — registered once
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  useFactory: () => ({
    autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
    // directive transformers registered here, once
  }),
});

// a feature applies the shared directive on a field
@Field()
@AuthDirective()
email: string;
```

Why it is right: the directive has one shared definition and one registration point, and features
apply it without owning it.

Reference: [NestJS GraphQL Directives](https://docs.nestjs.com/graphql/directives) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)
