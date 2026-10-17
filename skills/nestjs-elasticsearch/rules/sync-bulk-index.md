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
// common/search/search.repository.ts (base) — policy only; the engine call is behind the seam
async bulkIndex(docs: Doc[], index: string = this.index): Promise<void> {
  if (!docs.length) return;
  await this.backend.bulkIndex(index, docs); // the ONE _bulk implementation lives in the backend
}

// infra/elasticsearch/elasticsearch.backend.ts — the only place _bulk is issued
async bulkIndex(index: string, docs: unknown[]): Promise<void> {
  const res = await this.es.bulk({
    operations: docs.flatMap((d) => [
      { index: { _index: index, _id: (d as { id: string }).id } }, // the target index, not necessarily the alias
      d,
    ]),
    refresh: false, // never refresh per batch
  });
  this.assertBulkClean(res, docs); // HTTP 200 does not mean every document landed
}

async refresh(index: string): Promise<void> {
  await this.es.indices.refresh({ index }); // one refresh per run, not per batch
}

// a partial bulk is a failed bulk: 429-class failures retry, mapping errors fail the job
private assertBulkClean(res: BulkResponse, docs: unknown[]): void {
  if (!res.errors) return;

  // `items` is in submitted order, so items[i] belongs to docs[i]
  const failed = res.items.flatMap((item, i) => {
    const result = Object.values(item)[0] as { status: number; error?: unknown };
    return result.error ? [{ doc: docs[i], status: result.status, error: result.error }] : [];
  });

  const retryable = failed.filter((f) => [429, 502, 503, 504].includes(f.status));
  const fatal = failed.filter((f) => ![429, 502, 503, 504].includes(f.status));

  // `errors: true` with no item matching the expected shape: fail loudly. Throwing an empty
  // retryable error would make the queue retry forever with no progress.
  if (!failed.length) throw new Error('bulk reported errors with no per-item error');

  // both are plain Error subclasses the queue treats as retryable and non-retryable
  if (fatal.length) throw new BulkIndexError(fatal); // will fail again on every retry
  throw new RetryableBulkError(retryable);           // let the queue retry with backoff
}

// common/search/search-reindex.engine.ts — refresh once, after the loop
let cursor: string | undefined;
for (;;) {
  const page = await repo.loadBatch(cursor, 500);
  if (!page.docs.length) break;
  await repo.bulkIndex(page.docs, target); // fill the NEW index, not the live alias
  cursor = page.nextCursor;
  if (!cursor) break;
}
await this.backend.refresh(target); // one refresh for the whole run, through the seam
```

Why it is right: documents travel in batches, `refresh: false` avoids a segment refresh per batch,
and a single refresh at the end makes the whole index visible at once.

A bulk request answers HTTP 200 even when individual operations fail: the response carries
`errors: true` and a per-item `error`, so a reindex can look successful while documents are missing
from the index. `assertBulkClean` reads that response, retries 429-class backpressure and fails the
job on a mapping error, so a partial index is never mistaken for a complete one.

The `operations` array alternates an action line and a document line; a single `bulkIndex` covers
both full and incremental paths, so there is one bulk implementation in the codebase.

Reference: [Elasticsearch — Bulk API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-bulk)
