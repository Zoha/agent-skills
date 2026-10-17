---
title: Compute Derived and Relation Fields in a Batch Mapper
impact: HIGH
impactDescription: "3 queries per 500 documents, never N+1"
tags: mapping, derived, mapper, batch
---

## Compute Derived and Relation Fields in a Batch Mapper

**Impact: HIGH** — 3 queries per 500 documents, never N+1

Derived fields (a count, a rating) and relation fields (an author's name) are computed when a
document is mapped for indexing, not read from the entity. Compute them **in batch** for the whole
page — one aggregate or one lookup for the batch — and reuse the same domain logic the GraphQL
resolvers use, so there is a single source of truth.

**Incorrect (a query per document inside the mapper):**

```typescript
private async toDocuments(posts: PostDocument[]): Promise<PostSearchDocument[]> {
  return Promise.all(posts.map(async (p) => ({
    id: p._id.toString(),
    title: p.title,
    authorName: (await this.authors.findById(p.authorId)).name,       // query per post
    likeCount: await this.likes.countFor(p._id),                        // query per post
  })));
}
```

Why it is wrong: reindexing 10,000 posts issues 20,000 queries, so the reindex is dominated by
round-trips and can saturate the database.

**Correct (batch the derived data for the whole page):**

```typescript
private async toDocuments(posts: PostDocument[]): Promise<PostSearchDocument[]> {
  const ids = posts.map((p) => p._id.toString());

  const [likes, authors] = await Promise.all([
    this.likes.countForMany(ids),                 // one aggregate for the batch
    this.authors.namesFor(posts.map((p) => p.authorId)), // one query for the batch
  ]);

  return posts.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    authorName: authors.get(p.authorId.toString()) ?? '',
    likeCount: likes.get(p._id.toString()) ?? 0,
  }));
}
```

Why it is right: each batch of 500 documents costs a fixed three queries, and the derived values
come from the same domain services the GraphQL field resolvers use, so they cannot disagree.

The batch mapper is the only mapper. The incremental path (`loadByIds`) and the full path
(`loadBatch`) both call `toDocuments`, so there is one place derived fields are produced. A count
that is read constantly is cached on the owning document instead of recomputed — see
`rel-derived-counter-cache`.

See `relations-dataloader` in the `nestjs-graphql-structure` skill for the per-request batching
pattern this batch mapper mirrors.

Reference: [DataLoader](https://github.com/graphql/dataloader) | [MongoDB — Aggregation](https://www.mongodb.com/docs/manual/aggregation/)
