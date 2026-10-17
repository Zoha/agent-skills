---
title: Search Returns IDs Only
impact: CRITICAL
impactDescription: "MongoDB stays the only source of returned data"
tags: query, _source, ids, retrieval
---

## Search Returns IDs Only

**Impact: CRITICAL** — MongoDB stays the only source of returned data

Elasticsearch is a finder, not a store to read from. Every search disables `_source` so the
response carries only the document `_id`s and the sort values needed for the next page. The
entities are then loaded from MongoDB. The index never needs the full document, and results can
never be served with fields that have gone stale.

**Incorrect (the full document is read out of Elasticsearch):**

```typescript
const res = await this.es.search({
  index: 'users',
  query: { multi_match: { query: term, fields: ['name', 'email'] } },
});
return res.hits.hits.map((h) => h._source); // served straight from the index
```

Why it is wrong: the response is the indexed copy, which can lag MongoDB, and every field read from
`_source` must be kept in the index even though it is never used for searching.

**Correct (IDs and sort values only; `_source` disabled):**

```typescript
// common/search/search.repository.ts (base)
const res = await this.es.search({
  index: this.index,
  _source: false,                 // no field data in the response
  size: limit,
  query,
  sort,
  ...(searchAfter ? { search_after: searchAfter } : {}),
});

return {
  ids: res.hits.hits.map((h) => h._id),
  total: typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0,
  nextCursor: res.hits.hits.length === limit ? encodeCursor(res.hits.hits.at(-1)!.sort!) : null,
};
```

Why it is right: Elasticsearch returns identifiers and ranking order only, so the index is a pure
search structure and MongoDB remains the single source of returned field data.

`_source: false` also means fields that are only ever filtered on (not returned) still earn their
place in the mapping, while fields nobody queries can be dropped entirely (see
`map-exclude-non-search-fields`). The IDs are hydrated in the next step — see
`query-hydrate-restore-order`.

Reference: [Elasticsearch — Retrieve selected fields](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/retrieve-selected-fields)
