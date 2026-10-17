---
title: Paginate with search_after
impact: HIGH
impactDescription: "deep pagination past 10,000 results, consistently"
tags: query, pagination, cursor, search_after, pit
---

## Paginate with search_after

**Impact: HIGH** — deep pagination past 10,000 results, consistently

Use `search_after` for cursor pagination. Offset pagination (`from`/`size`) is capped at 10,000
results and gets more expensive as the offset grows, so it is only acceptable for a small, bounded
list. `search_after` walks the sorted result set by carrying the last hit's sort values forward as
an opaque cursor. For a consistent snapshot across a deep traversal, add a point in time (PIT).

**Incorrect (offset pagination that breaks past the cap):**

```typescript
// infra/elasticsearch/elasticsearch.backend.ts — offset pagination (the anti-pattern)
const res = await this.es.search({
  index: 'users',
  from: page * limit,   // from + size must stay under index.max_result_window (10,000)
  size: limit,
  query,
});
// Past 10,000 results Elasticsearch rejects the request.
```

Why it is wrong: it cannot page past 10,000 hits, and each request makes every shard materialise and
sort `from + size` documents, so deep pages get progressively slower.

**Correct (carry sort values forward as a cursor):**

```typescript
// common/search/search.repository.ts (base) — policy only; the engine call is behind the seam.
// The cursor travels in the request and comes back out; the base never names an engine.
async searchIds(term: string | undefined, sort: object[], limit: number, cursor?: string) {
  return this.backend.searchIds({ alias: this.index, term, sort, limit, cursor });
}
```

```typescript
// common/search/search.cursor.ts — opaque cursor over the sort values
export const encodeCursor = (sort: unknown[]) =>
  Buffer.from(JSON.stringify(sort)).toString('base64url');
export const decodeCursor = (cursor: string): unknown[] =>
  JSON.parse(Buffer.from(cursor, 'base64url').toString());
```

Why it is right: the cursor is just the last hit's sort values, so paging is O(page) regardless of
depth and works past 10,000 results.

The `search_after` mechanics live in the Elasticsearch backend, because that is the only layer that
may name the client: it decodes the cursor, passes `search_after`, and encodes the last hit's sort
values back into `nextCursor` (see `query-ids-only-search`). The base repository and every feature
repository only pass the cursor through, so both backends stay interchangeable.

The `query` and `sort` must be identical on every page, and the sort must be deterministic (a unique
tiebreaker) — see `query-sort-tiebreaker`. For a consistent snapshot during a deep traversal, open a
**PIT** and pass `pit: { id, keep_alive }` on each request, carrying the latest `pit_id` forward;
close the PIT when finished. PIT is optional for shallow pages and recommended for exports.

Reference: [Elasticsearch — Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results) | [Elasticsearch — Open point in time](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-open-point-in-time)
