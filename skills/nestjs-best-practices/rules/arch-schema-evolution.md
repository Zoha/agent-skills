---
title: Use Schema Evolution for Breaking Changes
impact: MEDIUM
impactDescription: Schema evolution allows you to evolve your GraphQL API without breaking existing clients
tags: graphql, schema, deprecation, evolution
---

## Use Schema Evolution for Breaking Changes

Use GraphQL's `@deprecated` directive and additive changes when making breaking changes to your schema. Add new fields and types instead of modifying existing ones. This allows old clients to continue working while new clients use updated fields. For major overhauls, use schema federation.

**Incorrect (breaking changes without deprecation):**

```typescript
// Breaking changes without deprecation
@ObjectType()
export class UserType {
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
export class UserType {
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

// For breaking changes: add new types
@ObjectType()
export class UserTypeV2 {
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

// Query returns both during transition
@Resolver(() => User)
export class UsersResolver {
  @Query(() => [UserType])
  async users(): Promise<UserType[]> {
    return this.usersService.findAll();
  }

  @Query(() => [UserTypeV2])
  async usersV2(): Promise<UserTypeV2[]> {
    return this.usersService.findAllV2();
  }
}

// Deprecation with replacement strategy
@ObjectType()
export class UserType {
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
export class UserType {
  @Field()
  id: string;

  @Field()
  name: string;

  // External field resolved by another service
  @Field(() => [OrderType], { nullable: true })
  @requires('id')
  orders?: OrderType[];
}

// Rename field with deprecation period
@ObjectType()
export class ProductType {
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
export enum UserStatus {
  @EnumMember('ACTIVE')
  ACTIVE = 'active',

  @EnumMember('INACTIVE')
  INACTIVE = 'inactive',

  // New value - safe to add
  @EnumMember('SUSPENDED')
  SUSPENDED = 'suspended',
}

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
