---
title: Locate and Policy the Generated Schema Artifact
impact: MEDIUM
impactDescription: the SDL is generated, not hand-edited
tags: schema, sdl, autoschemafile
---

## Locate and Policy the Generated Schema Artifact

**Impact: MEDIUM (the SDL is generated, not hand-edited)**

**Purpose.** In code-first GraphQL, the SDL is generated from the decorators according to
`autoSchemaFile`. The generated file has one documented home (commonly `src/schema.gql`) and a
team policy: commit it so schema changes appear in reviewable diffs, or ignore it and
regenerate. Either way it is never hand-edited.

**Placement.** The path set in `autoSchemaFile` in `infra/graphql/graphql.module.ts`.

**Responsibilities.**

- Generate the SDL to a single, documented path.
- Keep one policy: commit the file for reviewable schema diffs, or gitignore it.

**Never.**

- Hand-edit the generated SDL — change the classes instead.
- Generate to multiple paths or commit conflicting copies.
- Generate into ephemeral build output only and lose the schema diff.

**Incorrect (schema file edited by hand):**

```graphql
# src/schema.gql — a field added by hand
type User {
  _id: ID!
  email: String!
  nickname: String   # not backed by any @ObjectType field; lost on next build
}
```

Why it is wrong: the change is invisible to the code that generates the schema and disappears
the next time the app starts.

**Correct (change the class; the SDL regenerates):**

```typescript
@ObjectType()
export class User {
  @Field(() => ID) _id: string;
  @Field() email: string;
  @Field() nickname: string;
}
// schema.gql is regenerated from this at startup/build and reviewed as a diff
```

Why it is right: the schema is derived from the code, the artifact always reflects the code,
and its diff shows exactly what changed in the public API.

Reference: [NestJS GraphQL Quick Start](https://docs.nestjs.com/graphql/quick-start)
