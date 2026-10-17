---
title: Index in Batches with the Bulk API
impact: HIGH
impactDescription: "one request per batch, not per document"
tags: sync, bulk, indexing, performance
---

## Index in Batches with the Bulk API

**Impact: HIGH** — one request per batch, not per document

A full or partial reindex touches many documents. Send them through the `_bulk` API in batches and
issue one `refresh` at the end rather than after every write. Never issue one indexing request per
document in a loop.

**Incorrect (a request per document, refreshed every time):**

```typescript
for (const user of users) {
  await this.es.index({ index: 'users', id: user.id, document: toDoc(user), refresh: true });
}
// 10,000 documents -> 10,000 round-trips and 10,000 refreshes
```

Why it is wrong: each document costs a round-trip and each `refresh: true` forces a Lucene segment
refresh, so a large reindex is orders of magnitude slower than it needs to be.

**Correct (one bulk request per batch, one refresh at the end):**

```typescript
// common/search/search.repository.ts (base)
async bulkIndex(docs: Doc[]): Promise<void> {
  if (!docs.length) return;
  await this.es.bulk({
    operations: docs.flatMap((d) => [
      { index: { _index: this.index, _id: d.id } },
      d,
    ]),
    refresh: false, // never refresh per batch
  });
}

// common/search/search-reindex.engine.ts — refresh once, after the loop
let cursor: string | undefined;
for (;;) {
  const page = await repo.loadBatch(cursor, 500);
  if (!page.docs.length) break;
  await repo.bulkIndex(page.docs);
  cursor = page.nextCursor;
  if (!cursor) break;
}
await this.es.indices.refresh({ index: target }); // one refresh for the whole run
```

Why it is right: documents travel in batches, `refresh: false` avoids a segment refresh per batch,
and a single refresh at the end makes the whole index visible at once.

The `operations` array alternates an action line and a document line; a single `bulkIndex` covers
both full and incremental paths, so there is one bulk implementation in the codebase.

Reference: [Elasticsearch — Bulk API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-bulk)
