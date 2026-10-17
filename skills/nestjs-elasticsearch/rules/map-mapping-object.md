---
title: Declare the Mapping as a Typed Object
impact: HIGH
impactDescription: "one source of truth for the index shape"
tags: mapping, schema, types
---

## Declare the Mapping as a Typed Object

**Impact: HIGH** — one source of truth for the index shape

Declare the index mapping as a plain object, typed against the search document with `satisfies`.
This keeps the mapping, the document, and the mapper in agreement, and it is the one place the
index shape is defined. Do not scatter mapping metadata across decorators on the entity, and do not
hand-write the mapping in a separate file from the document it describes.

**Incorrect (mapping lives apart from the document, in untyped JSON):**

```typescript
// infra/elasticsearch/mappings.ts — a hand-written mapping on the other side of the app
export const mappings = {
  users: { properties: { name: { typ: 'text' }, email: { type: 'keyword' } } }, // typo: 'typ'
};
```

Why it is wrong: the mapping is untyped and lives away from the document it must match, so a typo
or a renamed field is caught only at index time, if at all.

**Correct (mapping typed against the document, beside it):**

```typescript
// modules/users/search/users.search-document.ts
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>
  & { id: string; authorName: string; likeCount: number };

export const USER_SEARCH_MAPPING = {
  id:         { type: 'keyword' },
  name:       { type: 'text' },
  email:      { type: 'keyword' },
  createdAt:  { type: 'date' },
  authorName: { type: 'text' },
  likeCount:  { type: 'integer' },
} satisfies SearchMapping<UserSearchDocument>;

// the index definition carries document + mapping together
export const USERS_INDEX: SearchIndexDef<UserSearchDocument> = {
  alias: 'users',
  version: 'users_v1',
  mapping: USER_SEARCH_MAPPING,
};
```

Why it is right: the mapping and the document are one unit, `satisfies` checks the mapping's keys
against the document, and changing the shape is a single, reviewable edit.

A `keyword` field is exact-match, aggregatable, and sortable; a `text` field is analyzed for
full-text search. Mirror a text field with a `.keyword` sub-field only when you also need to sort
or filter on it — see `map-analyzers`.

Reference: [Elasticsearch — Mapping](https://www.elastic.co/docs/manage-data/data-store/mapping)
