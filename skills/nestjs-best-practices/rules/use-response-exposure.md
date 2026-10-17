---
title: Control Response Exposure with GraphQL Types
impact: MEDIUM
impactDescription: Type design prevents accidental data exposure and ensures consistency
tags: graphql, types, exposure, mappers
---

## Control Response Exposure with GraphQL Types

Never return a persistence document straight through a resolver. What a client can see is decided by the `@Field()` declarations on the `@ObjectType`: a field that must never leave the server is persisted with `select: false` and simply has no `@Field()`. When the API shape stops matching the stored shape, split `entities/` (persistence) from `models/` + `mappers/`. The GraphQL schema is the API contract.

**Incorrect (returning the raw document, or hand-spreading objects):**

```typescript
// Return the raw document
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => User)
  async user(@Args() args: FindUserArgs) {
    return this.usersRepository.findById(args.id);
    // { _id, __v, passwordHash, resetToken, ... } — secrets reach the client
  }
}

// Manual object spreading (error-prone)
const user = await this.usersRepository.findById(id);
return { id: user.id, email: user.email, name: user.name };
// Easy to forget to exclude a sensitive field
```

**Correct (declare exactly what is exposed; split when shapes diverge):**

```typescript
// modules/users/entities/user.entity.ts — merged entity/object type (the default)
@ObjectType()
@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Field(() => ID)
  _id: string;

  @Field()
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true, select: false }) // persisted, NOT a @Field
  passwordHash: string;

  @Prop({ select: false })                 // persisted, NOT a @Field
  resetToken?: string;
}

// When the exposed shape stops matching storage, split it:
// modules/users/models/user.model.ts — the public graph
@ObjectType()
export class UserModel {
  @Field(() => ID)
  _id: string;

  @Field()
  email: string;

  @Field(() => String, { nullable: true })
  avatarUrl?: string; // computed from avatarKey

  @Field(() => Int)
  postCount!: number; // computed — declared type-only, never populated
}

// modules/users/mappers/user.mapper.ts — one conversion, testable in isolation.
// Maps stored fields only; a computed field is never assigned here.
export function toUserModel(doc: UserDocument): UserModel {
  return {
    _id: doc._id.toString(),
    email: doc.email,
    avatarUrl: doc.avatarKey ? cdnUrl(doc.avatarKey) : null,
  };
}

// modules/posts/resolvers/user-posts.resolver.ts — the data owner owns the field
// (see nestjs-graphql-structure -> relations-owning-module). This is the computed
// field's single source of truth, and it is never assigned in the mapper.
@Resolver(() => UserModel)
export class UserPostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @ResolveField(() => Int)
  postCount(@Parent() user: UserModel): Promise<number> {
    return this.postsService.countByUserId(user._id);
  }
}

// Input types for mutations live in dto/ and are separate from entities
@InputType()
export class CreateUserInput {
  @Field() @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(100)
  name: string;

  @Field() @IsEmail()
  email: string;

  @Field() @IsString() @MinLength(8)
  password: string;
}

@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}
```

When a field should only be visible to some roles, gate it with a schema directive (`common/directives/`) rather than per-group serialization.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS GraphQL Mapped Types](https://docs.nestjs.com/graphql/mapped-types) | [Mongoose select](https://mongoosejs.com/docs/api/schematype.html#schematype_SchemaType-select)
