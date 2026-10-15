---
title: Place MongoDB Entities in entities/
impact: MEDIUM-HIGH
impactDescription: one class per stored document, exposed only where safe
tags: mongodb, mongoose, entity, objecttype
---

## Place MongoDB Entities in entities/

**Impact: MEDIUM-HIGH (one class per stored document, exposed only where safe)**

**Purpose.** A MongoDB document lives in the owning feature's `entities/` folder. In the
default (merged) case the same class is both the persistence schema and the GraphQL
`@ObjectType`, which keeps the two in sync for simple, one-to-one domain objects.

**Placement.** `modules/<feature>/entities/<feature>.entity.ts`. One entity per file; the
class name is singular and PascalCase (`User`).

**Responsibilities.**

- Define the document shape with `@Schema` and `@Prop`.
- Expose only safe fields to GraphQL with `@Field()`.
- Declare indexes on unique and frequently queried fields.
- Export the `SchemaFactory`-built schema.

**Never.**

- Live in a global `src/entities/` technical folder.
- Put `@Field()` on secrets (password hashes, tokens) — persist them, do not expose them.
- Let the merged class grow until the API shape and the stored shape diverge. That is the
  signal to split into `models/` + `mappers/` (see `data-models-mappers`).

**Incorrect (global folder, secrets exposed, no index):**

```typescript
// src/entities/user.entity.ts — outside its feature
@ObjectType()
@Schema()
export class User {
  @Field() email: string;
  @Field() passwordHash: string;   // exposed in the schema
  @Field() resetToken: string;     // exposed in the schema
  // no unique index on email -> full collection scans, duplicates allowed
}
```

Why it is wrong: the entity escapes its feature, and fields that must never leave the server
become part of the public graph.

**Correct (feature-local, safe exposure, indexed):**

```typescript
// modules/users/entities/user.entity.ts
export type UserDocument = HydratedDocument<User>;

@ObjectType()
@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true, select: false }) // persisted, NOT a @Field
  passwordHash: string;

  @Prop({ select: false })                 // persisted, NOT a @Field
  resetToken?: string;

  @Field()
  @Prop({ required: true })
  name: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
```

Why it is right: the document lives with its feature, only safe fields reach the schema, and
the lookup column is indexed so queries do not scan the whole collection.

When the API shape stops matching storage — computed fields, relation-only fields, or secrets
that need a different exposure — keep the entity persistence-only and move the exposed type
to `models/` with a `mappers/` file. See `data-models-mappers`.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)
