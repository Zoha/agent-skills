---
title: Delete from the Index Immediately
impact: MEDIUM-HIGH
impactDescription: "deleted documents stop appearing in search at once"
tags: sync, deletes, indexing
---

## Delete from the Index Immediately

**Impact: MEDIUM-HIGH** — deleted documents stop appearing in search at once

Deletes do not need debouncing — there is nothing to coalesce, and a stale hit is worse than a
missing one. Delete from the index immediately, and ignore the not-found case so a repeated delete
is harmless. Handle the delete-missing-in-Mongo case in the incremental indexer by deleting instead
of indexing.

**Incorrect (deletes share the debounced path, or are omitted):**

```typescript
@OnEvent('user.deleted')
async onDeleted(e: { id: string }): Promise<void> {
  await this.usersSearch.enqueueIndex(e.id); // wrong: indexes a document that is gone
}

// or: nothing at all — the document lingers in Elasticsearch and keeps matching
```

Why it is wrong: re-enqueuing on delete either resurrects the document (if the loader still finds
it) or leaves a dangling hit that surfaces in results.

**Correct (immediate delete, 404 ignored; indexer deletes when the source is gone):**

```typescript
// common/search/search.repository.ts (base)
async deleteOne(id: string): Promise<void> {
  // deletes are low-frequency, so refresh here: a stale hit is worse than a missing one.
  // This is the deliberate exception to "never refresh per batch" (see sync-bulk-index).
  await this.es.delete({ index: this.index, id }, { ignore: [404], refresh: true }); // idempotent
}

// modules/users/search/users.search-indexer.ts
@OnEvent('user.deleted')
async onDeleted(e: { id: string }): Promise<void> {
  await this.usersSearch.deleteOne(e.id); // no debounce
}

// common/search/search-reindex.processor.ts — the incremental path handles a missing source
@Process('index-one')
async indexOne(job: Job<{ alias: string; id: string }>): Promise<void> {
  const repo = this.registry.repository(job.data.alias);
  const docs = await repo.loadByIds([job.data.id]);
  if (!docs.length) return repo.deleteOne(job.data.id); // deleted between enqueue and run
  await repo.bulkIndex(docs);
}
```

Why it is right: `refresh: true` makes the delete visible at once, `ignore: [404]` makes it
idempotent, and the incremental processor deletes when the source document has since disappeared.

The refresh is deliberate and local to deletes. Without it the document stays searchable until the
next index refresh — about a second by default — so "immediately" would really mean "within the
refresh interval". Deletes are low-frequency, so one refresh per delete is cheap; a batch index is
the opposite case, where `refresh: false` is what keeps a reindex fast (see `sync-bulk-index`).

A soft-delete design (a `deletedAt` field) instead indexes the document normally and filters
deleted documents at query time; pick one approach per feature and apply it consistently.

Reference: [Elasticsearch — Delete API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-delete)
