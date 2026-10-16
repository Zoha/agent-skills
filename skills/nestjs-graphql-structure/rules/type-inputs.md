---
title: Define GraphQL Inputs in dto/
impact: HIGH
impactDescription: validated inputs are the API boundary
tags: graphql, input, dto, validation
---

## Define GraphQL Inputs in dto/

**Impact: HIGH (validated inputs are the API boundary)**

**Purpose.** Mutation and query inputs are declared as code-first `@InputType()` classes and
live in the feature's `dto/` folder. They are the boundary where untrusted input is validated
and shaped, so they must carry validation and must never expose internal fields.

**Placement.** `modules/<feature>/dto/create-<entity>.input.ts`,
`update-<entity>.input.ts`. Class names end in `Input`.

**Responsibilities.**

- Declare exactly the fields the operation accepts, with `@Field()`.
- Validate each field with `class-validator`.
- Derive variants with mapped types (`PartialType`, `OmitType`, `PickType`).

**Never.**

- Reuse a persistence entity as an input.
- Accept sensitive or internal fields (`passwordHash`, `roles`) on self-service inputs.
- Skip validation and trust the client.

**Incorrect (entity reused, no validation, internal fields exposed):**

```typescript
// dto/user.input.ts
@InputType()
export class UserInput {
  @Field({ nullable: true }) email?: string;
  @Field({ nullable: true }) passwordHash?: string; // client can set the hash
  @Field({ nullable: true }) roles?: string[];      // privilege escalation
}

@Query(() => User)
user(@Args('email') email: string) { /* raw scalar, nothing validated */ }
```

Why it is wrong: nothing is validated, the client can set fields it must not control, and
there is no distinct shape for create versus update.

**Correct (validated input type, derived variants):**

```typescript
// dto/create-user.input.ts
@InputType()
export class CreateUserInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString() @MinLength(8) @MaxLength(72)
  password: string;

  @Field()
  @IsString() @MaxLength(100)
  name: string;
}

// dto/update-user.input.ts — derived, never hand-duplicated
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}
```

Why it is right: the accepted shape is explicit and validated per field, and update/read
variants are derived, so they cannot drift from the create shape.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS Mapped Types](https://docs.nestjs.com/graphql/mapped-types)
