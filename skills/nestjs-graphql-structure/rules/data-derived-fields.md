---
title: Compute Derived Fields; Do Not Store Them
impact: MEDIUM-HIGH
impactDescription: no duplicated or derivable data in the database
tags: mongodb, derived-fields, denormalization, virtuals, compute
---

## Compute Derived Fields; Do Not Store Them

**Impact: MEDIUM-HIGH (no duplicated or derivable data in the database)**

**Purpose.** Do not persist what can be derived: totals, counts, a "full name", a status computed
from other fields, and whole sub-objects already stored elsewhere. Storing a derived value creates a
second source of truth, so every write path must remember to keep the copy in sync and the copies
drift. Keep the source on the document and derive the value where it is read — a resolver
(`@ResolveField`), a mapper, a Mongoose virtual, or an aggregation. Persist a derived value only as
a deliberate materialised cache you own the recomputation of.

**Placement.** Source fields live on the entity (`entities/`). The derived value is produced in a
resolver (`resolvers/<type>.resolver.ts`, see `resolver-computed-fields`), a mapper (`mappers/`, see
`data-models-mappers`), or a Mongoose virtual on the schema.

**Responsibilities.**

- Store the minimal source data; derive everything else at read time.
- Resolve a derived field with `@ResolveField` (declared type-only on the `@ObjectType`) or as a
  virtual — never as an extra `@Prop`.
- Embed a sub-document only when the parent owns it; **reference** data owned elsewhere instead of
  copying it.
- If a value is materialised for performance, treat it as a cache: recompute it on every write (or
  a periodic job) and document that it is not the source of truth.

**Never.**

- Store a total, count, full name, or status that can be computed from other fields on the same
  document.
- Copy a related sub-object (an author's name or avatar) into every document that references it when
  a `ref` and one owner give the same data.
- Keep two fields that must always agree (a `name` and a denormalised `displayName`) with no single
  writer.
- `populate()` eagerly on every read to reconstruct what you duplicated.

**Incorrect (counts, totals, and a copied name stored as if they were truth):**

```typescript
@Schema()
@ObjectType()
export class Order {
  @Field(() => [OrderItem])
  @Prop({ type: [OrderItemSchema] })
  items: OrderItem[];

  @Field(() => Int)
  @Prop()
  itemCount: number;   // always equals items.length -> a second source of truth

  @Field(() => Float)
  @Prop()
  total: number;       // recomputed by hand on every write; drifts
}

@Schema()
export class Comment {
  @Prop({ type: Types.ObjectId, ref: User.name })
  authorId: Types.ObjectId;

  @Prop()
  authorName: string;  // duplicate of User.name; stale the moment the user renames
}
```

Why it is wrong: `itemCount` and `total` must be recomputed on every mutation and silently drift,
and `authorName` is a copy that goes stale on rename — both duplicate a source of truth.

**Correct (one stored source; derive on read; reference what you do not own):**

```typescript
// entities/order.entity.ts — the only stored source
@Schema()
export class Order {
  @Prop({ type: [OrderItemSchema] })
  items: OrderItem[];
}

// models/order.model.ts — derived fields are declared, never stored
@ObjectType()
export class OrderModel {
  @Field(() => [OrderItem]) items: OrderItem[];

  @Field(() => Int)
  itemCount!: number;   // computed

  @Field(() => Float)
  total!: number;       // computed
}

// resolvers/order.resolver.ts — resolved on demand
@Resolver(() => OrderModel)
export class OrderResolver {
  @ResolveField(() => Int)
  itemCount(@Parent() order: OrderModel): number {
    return order.items.length;
  }

  @ResolveField(() => Float)
  total(@Parent() order: OrderModel): number {
    return order.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  }
}

// entities/comment.entity.ts — reference the owner instead of copying it
@Schema()
export class Comment {
  @Prop({ type: Types.ObjectId, ref: User.name })
  authorId: Types.ObjectId;
  // authorName is resolved from the referenced user, not stored here
}
```

Why it is right: each value has exactly one stored source, derived fields are computed on read, and
the comment references the user instead of copying a name that can change.

**Deliberate exception — the materialised cache.** When a derived value is read far more often than
written and computing it is expensive (a large aggregate), persist it as a computed value and
recompute it on every write or a periodic job — and record that it is a cache. That is MongoDB's
Computed Values pattern; it is a conscious trade, not the default.

Reference: [MongoDB Data Modeling Best Practices](https://www.mongodb.com/docs/manual/data-modeling/best-practices/) | [MongoDB Computed Values Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/computed-values/)

**Behavioral depth.** See `nestjs-best-practices` -> `use-types-serialization`.
