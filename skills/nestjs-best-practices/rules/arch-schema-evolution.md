---
title: Use Schema Evolution for Breaking Changes
impact: MEDIUM
impactDescription: Schema evolution allows you to evolve your GraphQL API without breaking existing clients
tags: graphql, schema, deprecation, evolution
---

## Use Schema Evolution for Breaking Changes

Use GraphQL's `@deprecated` directive and additive changes when making breaking changes to your schema. Add new fields to existing types instead of mutating or replacing them — old clients keep working while new clients use the new fields. To split one schema across services, use schema federation; federation is a decomposition tool, not a way to version types.

The generated SDL is never hand-edited — evolve the `@ObjectType()` classes and let the schema regenerate.

**Incorrect (breaking changes without deprecation):**

```typescript
// Breaking changes without deprecation
@ObjectType()
export class User {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field()
  fullName: string; // Will be replaced by firstName + lastName
}

// Old clients expect: { id, name, fullName }
// New clients want: { id, name, firstName, lastName }
// Old clients break when fullName is removed!
```

**Correct (use @deprecated directive and additive changes):**

```typescript
// Use @deprecated for field evolution
@ObjectType()
export class User {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field({ deprecationReason: 'Use firstName and lastName instead' })
  fullName: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;
}

// For breaking changes, evolve the existing type in place — never add a parallel one.
// 1. Add the new fields (additive, safe: old clients simply ignore them).
// 2. @deprecated the old field with a deprecationReason (see fullName above).
// 3. Remove the old field only after every client has migrated. Check schema usage
//    metrics, then delete the @Field and the resolver code behind it.
//
// Do NOT add a UserV2 type and a usersV2 query. It fragments the schema, doubles the
// runtime code paths, and old clients still break when UserV2 becomes the only type.

// Deprecation with replacement strategy
@ObjectType()
export class User {
  @Field()
  id: string;

  @Field({ deprecationReason: 'Use emailAddress instead' })
  email: string;

  @Field()
  emailAddress: string; // New field
}

// Schema federation splits one schema across services — it is not a way to version
// types. The owning service defines the entity and its @key; other services extend it
// and mark the fields they do not own as @external.

// users service — owns the User entity
@Directive('@key(fields: "id")')
@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}

// orders service — extends the same entity; id is resolved by the users service
@Directive('@key(fields: "id")')
@ObjectType()
export class User {
  @Field(() => ID)
  @Directive('@external')
  id: string;

  // This service contributes orders to the shared User entity
  @Field(() => [Order], { nullable: true })
  orders?: Order[];
}

// Rename field with deprecation period
@ObjectType()
export class Product {
  @Field()
  id: string;

  @Field({ deprecationReason: 'Use displayName instead' })
  name: string;

  @Field()
  displayName: string;

  @Field({ nullable: true })
  description: string;
}

// Enum evolution - add values, don't remove
// constants/user-status.enum.ts — enums live in their own file, never in a class file
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',

  // New value - safe to add
  SUSPENDED = 'suspended',
}

registerEnumType(UserStatus, { name: 'UserStatus' });

// Input type evolution
@InputType()
export class CreateUserInput {
  @Field()
  name: string;

  @Field()
  email: string;

  // New optional field - safe to add
  @Field({ nullable: true })
  phoneNumber?: string;
}
```

Reference: [GraphQL Schema Design](https://graphql.org/learn/schema/) | [NestJS GraphQL Deprecation](https://docs.nestjs.com/graphql/resolvers)
