---
title: Keep Elasticsearch Fields Out of the Entity
impact: CRITICAL
impactDescription: "the entity stays Mongo/GraphQL only; ES has its own type"
tags: architecture, schema, search-document, separation
---

## Keep Elasticsearch Fields Out of the Entity

**Impact: CRITICAL** — the entity stays Mongo/GraphQL only; ES has its own type

Elasticsearch needs fields that exist in neither MongoDB nor the GraphQL schema — a denormalized
relation name, an autocomplete field, a computed count. Do not add them to the entity. Give the
feature a dedicated **search document**: a separate type holding only the fields Elasticsearch
cares about.

**Incorrect (ES-only fields added to the entity):**

```typescript
// modules/users/entities/user.entity.ts
@ObjectType()
@Schema({ collection: 'users' })
export class User {
  @Field() @Prop() name: string;
  @Prop({ select: false }) passwordHash: string;

  @Field({ nullable: true })
  authorName?: string;   // never stored in Mongo, never used in GraphQL

  @Field({ nullable: true })
  suggest?: string;      // an ES completion field living on the entity
}
```

Why it is wrong: the entity now carries fields that exist for neither storage nor the API, Mongoose
and GraphQL both see them, and the entity's single responsibility is broken.

**Correct (a dedicated search document; the entity is untouched):**

```typescript
// modules/users/search/users.search-document.ts — the ES projection
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>          // mirrors, from the entity
  & { id: string; authorName: string; likeCount: number };     // derived, Elasticsearch-only

// modules/users/entities/user.entity.ts — unchanged, Mongo/GraphQL only
@ObjectType()
@Schema({ collection: 'users' })
export class User {
  @Field() @Prop({ required: true }) name: string;
  @Field() @Prop({ required: true, unique: true, index: true }) email: string;
  @Prop({ required: true, select: false }) passwordHash: string;
}
```

Why it is right: the search document holds only the Elasticsearch projection, the entity keeps its
single responsibility, and ES-only fields have one home.

The `Pick<UserDocument, ...>` half ties the search document to the entity: renaming a mirrored
field on the entity is then a compile error in the projection (see `map-typed-search-document`).

See `data-models-mappers` in the `nestjs-graphql-structure` skill for where the search document sits
in a feature's file layout.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)
