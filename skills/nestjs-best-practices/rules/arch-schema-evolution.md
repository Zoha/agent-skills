---
title: Use Schema Evolution for Breaking Changes
impact: MEDIUM
impactDescription: Schema evolution allows you to evolve your GraphQL API without breaking existing clients
tags: graphql, schema, deprecation, evolution
---

## Use Schema Evolution for Breaking Changes

Use GraphQL's `@deprecated` directive and additive changes when making breaking changes to your schema. Add new fields and types instead of modifying existing ones. This allows old clients to continue working while new clients use updated fields. For major overhauls, use schema federation.

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

// For breaking changes: add a new type instead of mutating the old one
@ObjectType()
export class UserV2 {
  @Field()
  id: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  email: string;

  @Field()
  createdAt: Date;
}

// Entry-point resolvers return both during transition
// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => [User])
  async users(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Query(() => [UserV2])
  async usersV2(): Promise<UserV2[]> {
    return this.usersService.findAllV2();
  }
}

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

// Schema federation for major changes
// Use @nestjs/graphql federation to split schema across services
@Directive('@key(fields: "id")')
@ObjectType()
export class User {
  @Field()
  id: string;

  @Field()
  name: string;

  // External field resolved by another service
  @Field(() => [Order], { nullable: true })
  @requires('id')
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
