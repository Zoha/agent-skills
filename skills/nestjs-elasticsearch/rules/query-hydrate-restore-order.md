---
title: Hydrate from MongoDB and Restore Relevance Order
impact: CRITICAL
impactDescription: "fresh data in relevance order; two queries, one result"
tags: query, hydration, mongodb, ordering
---

## Hydrate from MongoDB and Restore Relevance Order

**Impact: CRITICAL** — fresh data in relevance order; two queries, one result

A search returns IDs in relevance order. Load those entities from MongoDB in one `$in` query, then
reorder them to the ID order, because MongoDB does not preserve the input order of an `$in`. The
result is fresh data presented in the order Elasticsearch ranked it.

**Incorrect (returning MongoDB's order, or a query per id):**

```typescript
const { ids } = await this.usersSearch.findIds(args);
const users = await this.usersRepository.findByIds(ids);
return users; // MongoDB's order, not the relevance order Elasticsearch computed
```

Why it is wrong: the ranking Elasticsearch produced is discarded, so the most relevant result is no
longer first.

**Correct (one query, then reorder by the returned ID order):**

```typescript
// modules/users/services/users.service.ts
async findMany(args: FindUsersArgs, cursor?: string): Promise<Paginated<User>> {
  const { ids, total, nextCursor } = await this.usersSearch.findIds(args, cursor);
  if (!ids.length) return { nodes: [], total, nextCursor };

  const users = await this.usersRepository.findByIds(ids);          // ONE Mongo query
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const nodes = ids
    .map((id) => byId.get(id))
    .filter((u): u is User => u !== undefined);                     // restore relevance order

  return { nodes, total, nextCursor };
}
```

Why it is right: one MongoDB query fetches every entity, the map restores the relevance order in
memory, and the filter tolerates an id that was deleted between the search and the load.

This two-phase read is the point of the whole design: the search is a ranking over IDs, and the
entities always come from the source of truth. The filter covers the small race where a document is
removed from MongoDB after Elasticsearch matched it. Write it as a type predicate rather than
`.filter(Boolean)`: TypeScript does not narrow `(User | undefined)[]` from a plain boolean test, so
`filter(Boolean)` leaves `nodes` typed as `(User | undefined)[]` and fails to compile under `strict`.

Reference: [MongoDB — Query an Array with $in](https://www.mongodb.com/docs/manual/reference/operator/query/in/)
