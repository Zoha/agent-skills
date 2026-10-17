---
title: Mock the Search Backend Seam in Unit Tests
impact: HIGH
impactDescription: "unit tests run with no Elasticsearch"
tags: test, mocking, seam, unit
---

## Mock the Search Backend Seam in Unit Tests

**Impact: HIGH** — unit tests run with no Elasticsearch

The base repository is the single place every feature touches search
(`arch-base-search-repository`), and it depends on the `SearchBackend` interface
(`cfg-search-backend-seam`). That makes one fake enough for the whole codebase: provide a stub backend
in the testing module and no test ever needs a running cluster. Never call a live Elasticsearch from
a unit test (see `test-mock-external-services` in the `nestjs-best-practices` skill).

**Incorrect (the test instantiates the real client, or points at localhost):**

```typescript
// hits a real cluster that may not be running; slow and flaky
const service = new UsersService(
  new ElasticsearchService({ node: 'http://localhost:9200' }),
  usersRepo,
);

// or a mock so thin it asserts nothing about the contract
const backend = { searchIds: async () => ({ ids: [] }) };
```

Why it is wrong: the first needs Elasticsearch on every machine and in CI, and the second returns an
empty shape the real contract never produces, so the test passes while the hydration path is
untested.

**Correct (stub the interface; assert hydration and ordering):**

```typescript
// modules/users/services/users.service.spec.ts
const search = {
  enabled: true,
  searchIds: async () => ({ ids: ['b', 'a'], total: 2, totalIsExact: true, nextCursor: null }),
} as unknown as SearchBackend;
const users = { findByIds: async () => [/* MongoDB order: a, b */] };

const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: SEARCH_BACKEND, useValue: search },
    { provide: UsersRepository, useValue: users },
  ],
}).compile();

const service = module.get(UsersService);
const { nodes } = await service.findMany({ term: 'x' });

expect(nodes.map((n) => n.id)).toEqual(['b', 'a']); // relevance order restored, not MongoDB order
```

Why it is right: the fake implements the same shape the real backend returns, the test asserts the
behavior that matters (hydration plus order restoration), and moving search to a new engine changes
only the `SEARCH_BACKEND` provider, not the test.

Let the stub backend implement the whole interface, even the methods the unit under test does not
call. A partial object cast with `as unknown as SearchBackend` is acceptable in a test, but it hides
a new interface method from every future test, so prefer a small `createFakeSearchBackend()` helper
when more than one suite needs it.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing) | [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)
