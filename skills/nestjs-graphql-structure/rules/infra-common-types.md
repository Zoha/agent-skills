---
title: Put Shared Types in common/types/
impact: MEDIUM
impactDescription: context, auth user, and cross-cutting types have one home
tags: types, common, context
---

## Put Shared Types in common/types/

**Impact: MEDIUM (context, auth user, and cross-cutting types have one home)**

**Purpose.** TypeScript types and interfaces that more than one feature needs — the GraphQL
request context, the authenticated user shape, shared pagination interfaces — are not tied to any
one feature. They live in `common/types/` so features import a single definition instead of
re-declaring (and drifting) their own.

**Placement.** `src/common/types/<name>.ts` (for example `gql-context.ts`,
`authenticated-user.ts`).

**Responsibilities.**

- Hold feature-agnostic types and interfaces: the GraphQL `Context`, the `AuthenticatedUser`,
  shared pagination interfaces.
- Export named types; keep one concept per file.
- Stay free of any dependency on a feature.

**Never.**

- Declare a shared type inline in a resolver or in `app.module.ts`.
- Put a feature's own type here — that belongs to the feature.
- Use `common/types/` as a junk drawer; a type only one feature needs stays in that feature.

**Incorrect (the context type redeclared wherever it is needed):**

```typescript
// modules/users/resolvers/users.query.resolver.ts
@Query(() => User)
user(@Context() ctx: { req: Request; user: AuthenticatedUser }) { /* ... */ }

// modules/orders/... the same shape re-declared by hand, already drifting
```

Why it is wrong: the same context shape is re-declared per file, and the copies drift apart.

**Correct (one shared type in common/types/):**

```typescript
// common/types/authenticated-user.ts
export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
}

// common/types/gql-context.ts
import type { Request } from 'express';
import type { AuthenticatedUser } from './authenticated-user';

export interface GqlContext {
  req: Request;
  user?: AuthenticatedUser;
}

// a feature imports the one definition
import type { GqlContext } from '../../common/types/gql-context';
```

Why it is right: the context and user shapes have a single definition that every feature and
`infra/graphql` share, so they cannot drift.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)
