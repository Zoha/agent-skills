---
title: Split models/ and mappers/ When API Differs From Storage
impact: MEDIUM-HIGH
impactDescription: keep the public graph decoupled from the database
tags: models, mappers, objecttype, mongodb
---

## Split models/ and mappers/ When API Differs From Storage

**Impact: MEDIUM-HIGH (keep the public graph decoupled from the database)**

**Purpose.** By default a MongoDB entity doubles as its GraphQL `@ObjectType` (see
`data-entity-mongodb`). When the exposed shape stops matching the stored shape — computed
fields, relation-only fields, renamed ids, or fields that need different exposure — split
them: keep the entity persistence-only in `entities/`, put the GraphQL `@ObjectType` in
`models/`, and convert between them in `mappers/`.

**Placement.**

- `modules/<feature>/entities/<feature>.entity.ts` — persistence only (keep `@Schema`/`@Prop`,
  drop `@ObjectType`/`@Field`).
- `modules/<feature>/models/<feature>.model.ts` — the GraphQL `@ObjectType`.
- `modules/<feature>/mappers/<feature>.mapper.ts` — entity → model (including `_id` → `id`).

**Responsibilities.**

- Model: exactly the fields the API exposes.
- Mapper: a pure conversion from entity to model, handling id mapping and computed fields.

**Never.**

- Add `@Field()` back onto the persistence entity "just here".
- Return the raw document, leaking `_id`, `__v`, and internal flags.
- Do the conversion inline in more than one resolver or service.

**Incorrect (persistence document returned as the API type, internals leaking):**

```typescript
@Query(() => User)
async user(@Args('id') id: string) {
  return this.userModel.findById(id).lean(); // { _id, __v, passwordHash, email, ... }
}
```

Why it is wrong: the schema simply mirrors the database, and fields that must never leave the
server reach clients.

**Correct (entity stays persistence-only, model is the public graph, mapper converts):**

```typescript
// entities/user.entity.ts — persistence only
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop()
  avatarKey?: string;
}

// models/user.model.ts — the public graph
@ObjectType()
export class UserModel {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field(() => String, { nullable: true })
  avatarUrl?: string; // computed from avatarKey

  @Field(() => Int)
  postCount: number;
}

// mappers/user.mapper.ts
export function toUserModel(doc: UserDocument, postCount: number): UserModel {
  return {
    id: doc._id.toString(),
    email: doc.email,
    avatarUrl: doc.avatarKey ? cdnUrl(doc.avatarKey) : null,
    postCount,
  };
}
```

Why it is right: the database shape can change without touching the schema, the public graph
exposes only intended fields, and the conversion lives in one testable place.

Use this split only when the shapes actually diverge. For one-to-one domain objects, the
merged entity from `data-entity-mongodb` is simpler.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)
