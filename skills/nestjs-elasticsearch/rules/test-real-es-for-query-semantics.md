---
title: Test Query Semantics Against a Real Elasticsearch
impact: MEDIUM-HIGH
impactDescription: "analyzers, DSL and pagination are verified for real"
tags: test, integration, testcontainers, analyzers
---

## Test Query Semantics Against a Real Elasticsearch

**Impact: MEDIUM-HIGH** — analyzers, DSL and pagination are verified for real

A mocked backend proves your code calls the right method; it proves nothing about what Elasticsearch
does with the query. Analyzer behavior (`map-analyzers`), the default `_score` ordering, and
`search_after` pagination (`query-cursor-pagination`) exist only in the engine. These few integration
tests need a real cluster, so start a disposable one per suite with Testcontainers and tear it down
afterward. This is integration coverage; unit tests still mock the seam and never call an external
service (`test-mock-elasticsearch-seam`, and `test-mock-external-services` in the
`nestjs-best-practices` skill).

**Incorrect (asserting engine behavior against a hand-rolled fake):**

```typescript
// the fake "matches" on a fuzzy query because the test made it match — this proves nothing
const fake = {
  searchIds: async () => ({ ids: ['1'], total: 1, totalIsExact: true, nextCursor: null }),
};
```

Why it is wrong: the fake returns whatever the test told it to, so a wrong analyzer, a mapping that
never indexes a field, or a broken `search_after` cursor all pass.

**Correct (a throwaway cluster for the query-semantics suite):**

```typescript
// test/search.e2e-spec.ts
import { ElasticsearchContainer, StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
import { Client } from '@elastic/elasticsearch';

let es: StartedElasticsearchContainer;

beforeAll(async () => {
  es = await new ElasticsearchContainer('docker.elastic.co/elasticsearch/elasticsearch:8.15.0')
    .withEnvironment({ 'xpack.security.enabled': 'false' })
    .start();
}, 120_000);

afterAll(async () => {
  await es?.stop();
});

it('matches partial words with the configured analyzer', async () => {
  const client = new Client({ node: es.getHttpUrl() });
  await client.indices.create({
    index: 'users_v1',
    mappings: { properties: USER_SEARCH_MAPPING },
  });
  await client.index({
    index: 'users_v1',
    id: '1',
    document: { name: 'Elasticsearch' },
    refresh: true,
  });

  const res = await client.search({ index: 'users_v1', query: { match: { name: 'elastic' } } });
  expect(res.hits.hits.map((h) => h._id)).toEqual(['1']); // standard analyzer lowercased the term
});
```

Why it is right: the analyzer, mapping, and query run against the engine that will run them in
production, so a mapping or analyzer regression fails the suite instead of surfacing later as wrong
search results.

The suite needs a container runtime (Docker or Podman) locally and in CI; keep it in its own file so
the fast unit suite does not depend on one. Pin the image tag, not `latest`, so the engine behavior a
test asserts does not change underneath it. This is the only place that hits a live cluster; if the
whole suite would otherwise need Elasticsearch, that is a sign the mocked seam in
`test-mock-elasticsearch-seam` is missing from a unit test.

Reference: [Testcontainers for Node.js](https://node.testcontainers.org/) | [@nestjs/elasticsearch](https://github.com/nestjs/elasticsearch)
