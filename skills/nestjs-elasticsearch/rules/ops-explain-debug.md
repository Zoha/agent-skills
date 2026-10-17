---
title: Provide an Explain Hook
impact: MEDIUM
impactDescription: "the exact query DSL is inspectable while developing"
tags: ops, debugging, explain, dx
---

## Provide an Explain Hook

**Impact: MEDIUM** — the exact query DSL is inspectable while developing

When a search returns the wrong results, the fastest diagnosis is the query Elasticsearch actually
ran and why it scored the way it did. Expose a development-only hook that returns the query DSL, the
`took` time, and the hits — the same DSL can be pasted into Kibana Dev Tools. It also lets derived
and Elasticsearch-only fields (which never appear in normal results) be inspected.

**Incorrect (no way to see the query, or a temporary console.log in the repository):**

```typescript
async findIds(args: FindUsersArgs) {
  const query = buildQuery(args);
  console.log(query); // a temporary log that must be removed, and only shows the request
  return this.searchIds(query, sort, args.limit);
}
```

Why it is wrong: the query is only visible if someone remembers to add a log, and the response
(score, `took`, matched terms) is not visible at all.

**Correct (a dev-only explain that returns the DSL and the response):**

```typescript
// infra/elasticsearch/elasticsearch.backend.ts — explain names the client, so it lives in the
// backend behind the seam; no feature repository ever injects ElasticsearchService.
async explain(req: SearchRequest): Promise<SearchExplain> {
  const query = this.buildQuery(req.term);
  const res = await this.es.search({
    index: req.alias,
    query,
    sort: req.sort,
    size: 5,
    _source: ['authorName', 'likeCount'], // inspect ES-only fields here
  });

  return {
    query,                              // paste into Kibana Dev Tools
    took: res.took,
    hits: res.hits.hits.map((h) => ({ id: h._id, score: h._score, source: h._source })),
  };
}

// modules/users/search/users.search-repository.ts — the feature repo delegates; it names no client
explain(args: FindUsersArgs): Promise<SearchExplain> {
  return this.backend.explain({
    alias: this.index,
    term: args.search,
    sort: [{ createdAt: 'desc' }, { _id: 'asc' }],
    limit: 5,
  });
}

// modules/users/resolvers/users.query.resolver.ts — development-only query
@Query(() => String, { nullable: true })
async searchExplain(@Args() args: FindUsersArgs): Promise<string> {
  if (process.env.NODE_ENV === 'production') return null; // never expose in production
  return JSON.stringify(await this.usersSearch.explain(args), null, 2);
}
```

Why it is right: the exact DSL, the score, the timing, and the Elasticsearch-only fields are
available on demand, the query can be reproduced verbatim in Kibana or with the `_explain` API, and
the engine stays behind the seam. With `SEARCH_BACKEND=mongo` the fallback backend refuses the call
rather than pretending to explain a query that does not exist (see `cfg-mongo-fallback-backend`).

Gate the hook behind a non-production environment check; it exposes internal query shapes and
Elasticsearch-only fields. The same DSL is what the request/response logger records in production
(see `ops-log-es-requests`).

Reference: [Elasticsearch — Explain API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-explain) | [Kibana Dev Tools](https://www.elastic.co/docs/explore-analyze/query-filter/tools/console)
