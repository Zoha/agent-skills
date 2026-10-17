---
title: Type the Search Document Against the Entity
impact: HIGH
impactDescription: "renaming an entity field breaks the build, not search"
tags: mapping, types, search-document, drift
---

## Type the Search Document Against the Entity

**Impact: HIGH** — renaming an entity field breaks the build, not search

The search document mirrors a subset of the entity plus its derived fields. Tie that subset to the
entity with a `Pick<Entity, ...>` so a renamed or removed field is a compile error, not a silently
empty index field. List only the searchable fields — this is a projection, not a copy of the schema.

**Incorrect (an untyped bag of fields that drifts unnoticed):**

```typescript
// modules/users/search/users.search-document.ts
export interface UserSearchDocument {
  name: string;
  emailAddres: string;   // typo / renamed on the entity -> always undefined at index time
  authrName: string;
  [key: string]: unknown; // no relationship to the entity at all
}
```

Why it is wrong: nothing connects the document to the entity, so a renamed field silently stops
being indexed and search quietly degrades.

**Correct (mirrored fields are picked from the entity; derived fields are explicit):**

```typescript
// modules/users/search/users.search-document.ts
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>          // mirrors — checked against the entity
  & { id: string; authorName: string; likeCount: number };     // derived — explicit extras

export const USER_SEARCH_MAPPING = {
  id:         { type: 'keyword' },
  name:       { type: 'text' },
  email:      { type: 'keyword' },
  createdAt:  { type: 'date' },
  authorName: { type: 'text' },
  likeCount:  { type: 'integer' },
} satisfies SearchMapping<UserSearchDocument>;
```

Why it is right: renaming `email` on `UserDocument` breaks the `Pick`, the mapping cannot name a
field the type does not declare (`satisfies` enforces it), and only the searchable subset is listed.

Keep the document a projection: it should hold the handful of fields Elasticsearch searches, sorts,
or filters on — never the whole entity. Fields with no search purpose are simply absent (see
`map-exclude-non-search-fields`).

Reference: [TypeScript Pick utility type](https://www.typescriptlang.org/docs/handbook/utility-types.html#picktype-keys) | [TypeScript satisfies operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html)
