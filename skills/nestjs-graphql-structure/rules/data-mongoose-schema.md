---
title: Mongoose Schema Best Practices for Shared Types
impact: MEDIUM-HIGH
impactDescription: one class, correct schema options, nothing internal leaked
tags: mongoose, schema, objecttype, code-first, shared-types
---

## Mongoose Schema Best Practices for Shared Types

**Impact: MEDIUM-HIGH (one class, correct schema options, nothing internal leaked)**

**Purpose.** In the default (merged) case one class is *both* the Mongoose schema
(`@Schema`/`@Prop`) and the GraphQL `@ObjectType` (`@Field`) — a single **shared type** that
drives storage and the schema at once (see `data-entity-mongodb`). Keeping that one class correct
means getting a few schema-level things right: the hydrated document type, explicit types where
reflection cannot infer them, real schema options, and the `_id`/`__v` boundary.

**Placement.** `modules/<feature>/entities/<entity>.entity.ts`.

**Responsibilities.**

- Declare the hydrated document type once: `export type UserDocument = HydratedDocument<User>`.
- Pass real schema options to `@Schema(...)`: `timestamps: true`, an explicit `collection`, and a
  `toJSON`/`toObject` transform when the stored shape needs normalising.
- Give an explicit `@Prop` type whenever TypeScript reflection cannot infer it — arrays, nested
  objects, and every `ref` (`@Prop([String])`, `@Prop({ type: Types.ObjectId, ref: 'Owner' })`).
- Expose `_id` with `@Field(() => ID)` (the `ID` scalar stringifies it); never expose `__v`.
- Declare `timestamps` fields (`createdAt`/`updatedAt`) with `@Field` when clients need them.
- Index every unique or frequently queried field.

**Never.**

- Rely on the `@nestjs/graphql` CLI plugin to infer `@Prop`/`@Field` types from Mongoose types — it
  cannot reflect `ObjectId`, `Date`, or a `ref`, so declare those explicitly.
- Return the document as-is and leak `__v`, or type a field as a Mongoose model where the schema
  promises an `ID`.
- Re-declare the same shared type in several features; share it through a base `@ObjectType` class
  (`@ObjectType({ implements: () => [Base] })`) and the GraphQL mapped types instead.
- Store computed or duplicated values on the schema — that is `data-derived-fields`.

**Incorrect (ambiguous types left to inference; internals leak):**

```typescript
// entities/user.entity.ts
@ObjectType()
@Schema()
export class User {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop()                       // array type left implicit -> stored as Mixed
  tags: string[];

  @Prop({ type: Types.ObjectId, ref: 'Owner' })
  owner: Owner;                 // ref type not declared -> reflection cannot resolve it

  // no timestamps/collection/transform -> __v reaches clients
}
```

Why it is wrong: reflection and the CLI plugin cannot infer Mongoose-specific types, so the array
is stored as `Mixed` and the `ref` is unresolved, while `__v` leaks because nothing normalises the
document.

**Correct (explicit types, real options, safe exposure):**

```typescript
// entities/user.entity.ts
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@ObjectType()
@Schema({
  timestamps: true,
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field(() => [String])
  @Prop({ type: [String], default: [] })
  tags: string[];                                 // explicit array type

  @Field(() => ID)
  @Prop({ type: Types.ObjectId, ref: 'Owner', required: true })
  ownerId: Types.ObjectId;                        // explicit ref type

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Prop({ required: true, select: false })        // persisted, never exposed
  passwordHash: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true });
```

Why it is right: every ambiguous type is explicit, the schema options are real, `__v` and secrets
stay out of the graph, and the same class is usable as both the stored document and the published
type.

When the published shape and the stored shape genuinely diverge — computed/derived fields, relation
fields — split into `models/` + `mappers/` instead; see `data-models-mappers` and
`data-derived-fields`.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [Mongoose Schemas](https://mongoosejs.com/docs/guide.html) | [NestJS GraphQL CLI Plugin](https://docs.nestjs.com/graphql/cli-plugin)

**Behavioral depth.** See `nestjs-best-practices` -> `perf-optimize-database`.
