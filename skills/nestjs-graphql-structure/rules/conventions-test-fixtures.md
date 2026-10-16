---
title: Place Test Fixtures, Factories, and Helpers in test/
impact: MEDIUM
impactDescription: shared test data has one home, separate from the specs
tags: testing, fixtures, factories, conventions
---

## Place Test Fixtures, Factories, and Helpers in test/

**Impact: MEDIUM (shared test data has one home, separate from the specs)**

**Purpose.** Unit specs are co-located with their subject (see `conventions-testing`). The data those
specs share — seed objects, builders, fake providers, GraphQL request helpers — is not a spec, so it
does not sit inline in one spec or in a stray `helpers.ts`. It lives in `test/` (or a co-located
`__support__/` used by a single feature), so e2e and unit tests share one definition. Specs stay
about behavior; factories stay about shape.

**Placement.**

- Shared across the repository: `test/factories/`, `test/fixtures/`, `test/helpers/`.
- Single feature only: beside the specs, for example `modules/<feature>/services/__support__/`.

**Responsibilities.**

- Give builders and fixtures one home; name them for the entity (`UserFactory`, `aUser()`).
- Keep e2e helpers (an authenticated GraphQL client, a database reset) in `test/helpers/`.
- Drive GraphQL e2e tests by POSTing to `/graphql` against the real `AppModule`.

**Never.**

- Inline a shared fixture in one spec that other specs copy.
- Put a factory or fixture in `src/` — it is test-only.
- Hit a real external service from a helper (see `nestjs-best-practices` -> `test-mock-external-services`).

**Incorrect (shared test data copy-pasted into each spec):**

```typescript
// test/users.e2e-spec.ts and test/orders.e2e-spec.ts
const user = { id: '1', email: 'a@b.com', roles: ['user'] }; // copy 1
const user = { id: '1', email: 'a@b.com', roles: ['user'] }; // copy 2, drifts
```

Why it is wrong: the same fixture is duplicated per spec and drifts as the shape changes.

**Correct (one factory in test/, reused; e2e drives GraphQL):**

```typescript
// test/factories/user.factory.ts
export function aUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: '1', email: 'a@b.com', roles: ['user'], ...overrides };
}

// test/helpers/graphql.ts — one e2e request helper
export const gql = (app: INestApplication, query: string, variables?: object) =>
  request(app.getHttpServer()).post('/graphql').send({ query, variables });

// test/users.e2e-spec.ts
const res = await gql(app, `query { user(id: "1") { id email } }`).expect(200);
```

Why it is right: the fixture has one home and one shape, the e2e helper is shared, and the specs stay
about behavior.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

**Behavioral depth.** See `nestjs-best-practices` -> `test-use-testing-module`, `test-e2e-supertest`.
