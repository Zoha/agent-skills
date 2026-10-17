---
title: Cache Derived Counters on the Owning Document
impact: MEDIUM-HIGH
impactDescription: "sortable, filterable, cheap derived values"
tags: cross-entity, derived, counters, materialization
---

## Cache Derived Counters on the Owning Document

**Impact: MEDIUM-HIGH** — sortable, filterable, cheap derived values

Elasticsearch can only sort or filter on a value that is indexed, and a per-event aggregate is too
expensive to run on every increment. For a derived value that must be searchable — a view, like, or
comment count — cache it on the owning document in MongoDB, update it with an atomic `$inc`, and
mirror it into the index. The counter is a deliberate materialised cache, not a second source of
truth computed on read.

**Incorrect (no indexed value, or an aggregate per event):**

```typescript
// the count lives only in a comments collection, so it cannot be sorted or filtered in search
// and every view event runs a count aggregation against it
@OnEvent('view.created')
async onView(e: { postId: string }): Promise<void> {
  await this.postsSearch.enqueueIndex(e.postId); // reindex, but nothing to sort on
}
```

Why it is wrong: without an indexed value you cannot sort posts by popularity, and recomputing the
count per event is expensive under a high-frequency signal like views.

**Correct (atomic counter on the owner, mirrored into the index):**

```typescript
// modules/posts/repositories/posts.repository.ts — the cached counter
incrViews(postId: string): Promise<PostDocument | null> {
  return this.postModel
    .findByIdAndUpdate(postId, { $inc: { viewCount: 1 } }, { new: true })
    .exec();
}

// modules/posts/search/posts.search-indexer.ts — update the cache, then reindex the owner
@OnEvent('view.created')
async onView(e: { postId: string }): Promise<void> {
  await this.posts.incrViews(e.postId);          // cheap, atomic
  await this.postsSearch.enqueueIndex(e.postId); // debounced by jobId (see sync-debounce-same-id)
}
```

```typescript
// the counter is part of the post's search document
export type PostSearchDocument =
  Pick<PostDocument, 'title' | 'createdAt' | 'viewCount'>  // viewCount is indexed and sortable
  & { id: string; authorName: string };
```

Why it is right: `viewCount` is one atomic `$inc` on write, is indexed so posts can be sorted by
popularity, and reindexing the owner is debounced so a view storm produces one index update.

This is MongoDB's computed-value pattern applied where it earns its keep: the value is read far more
often than written and it must be searchable, so it is cached and owned by the document that holds
it. A value that is only ever displayed can stay derived on read.

Reference: [MongoDB — $inc](https://www.mongodb.com/docs/manual/reference/operator/update/inc/) | [MongoDB — Computed Values Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/computed-values/)
