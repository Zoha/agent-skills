---
title: Index Only Fields With a Search Purpose
impact: HIGH
impactDescription: "smaller, faster, safer index"
tags: mapping, projection, security, performance
---

## Index Only Fields With a Search Purpose

**Impact: HIGH** — smaller, faster, safer index

The search document is a projection: it contains exactly the fields Elasticsearch searches, sorts,
filters, or aggregates on — nothing more. Secrets, large blobs, and fields with no search purpose
are simply absent. Since searches return IDs only, Elasticsearch never needs to hold the full
document.

**Incorrect (the whole entity is mirrored into the index):**

```typescript
// every field is indexed, including ones with no search use and ones that must not leave Mongo
export type UserSearchDocument = UserDocument;

const toDoc = (u: UserDocument) => ({ ...u.toObject() }); // passwordHash, resetToken, bio, avatar bytes
```

Why it is wrong: the index carries secrets and dead weight, costs more to store and search, and a
later `_source` read would leak fields that should never leave MongoDB.

**Correct (only search-relevant fields are present):**

```typescript
// modules/users/search/users.search-document.ts
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>   // searched / sorted / filtered
  & { id: string; likeCount: number };

// mapper includes only those fields — nothing else
const toDoc = (u: UserDocument, stats: { likeCount: number }): UserSearchDocument => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  createdAt: u.createdAt,
  likeCount: stats.likeCount,
});
```

Why it is right: only fields with a query purpose are indexed, `passwordHash` and free-text `bio`
never enter Elasticsearch, and the index stays small.

The default is exclusion: a field earns its place in the mapping by being used in a query, sort, or
filter. Because queries return `_source: false` (see `query-ids-only-search`), a field that is never
queried has no reason to be indexed at all.

Reference: [Elasticsearch — Mapping and field types](https://www.elastic.co/docs/manage-data/data-store/mapping)
