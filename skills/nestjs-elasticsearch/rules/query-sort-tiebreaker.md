---
title: Always Include a Unique Sort Tiebreaker
impact: HIGH
impactDescription: "no skipped or duplicated results across pages"
tags: query, sorting, pagination, determinism
---

## Always Include a Unique Sort Tiebreaker

**Impact: HIGH** — no skipped or duplicated results across pages

`search_after` paging is only correct if the sort is total: every document must have a distinct sort
position. A non-unique sort (for example, by `createdAt` alone, where many documents share a
timestamp) lets documents slip through or repeat between pages. Always append a unique field — the
document id — as the final sort key.

**Incorrect (a non-unique sort with ties):**

```typescript
const sort = [{ createdAt: 'desc' }]; // many documents share a millisecond
const res = await this.es.search({ index: 'users', sort, size: limit, search_after });
// Ties between pages: some documents are skipped, others appear twice.
```

Why it is wrong: with equal sort values, the order between them is undefined, so the boundary
between pages is ambiguous and results are lost or duplicated.

**Correct (a unique tiebreaker as the final sort key):**

```typescript
// modules/users/search/users.search.repository.ts
const sort = [
  { createdAt: 'desc' }, // the user's chosen sort
  { _id: 'asc' },        // unique tiebreaker -> the sort is total
];

return this.searchIds(query, sort, args.limit, cursor);
```

Why it is right: the `_id` tiebreaker makes the sort total, so every page boundary is unambiguous
and no document is skipped or repeated.

The tiebreaker must be **unique and present on every indexed document**. A raw relevance sort
(`_score`) is not total either, so it also needs a tiebreaker. When a PIT is in use, Elasticsearch
adds an implicit `_shard_doc` tiebreaker, but an explicit unique field is still the portable choice.

Reference: [Elasticsearch — search_after and tiebreaker](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)
