---
title: Use Types and Serialization for GraphQL Responses
impact: MEDIUM
impactDescription: Type design prevents accidental data exposure and ensures consistency
tags: graphql, types, serialization, class-transformer
---

## Use Types and Serialization for GraphQL Responses

Never return entity objects directly from resolvers. Use GraphQL object types with `@ObjectType()` and `@InputType()` to control exactly what data is exposed. Use `class-transformer`'s `@Exclude()` and `@Expose()` decorators to prevent accidental exposure of sensitive fields. The GraphQL schema itself is your API contract.

**Incorrect (returning entities directly):**

```typescript
// Return entities directly
@Resolver(() => User)
export class UsersResolver {
  @Query(() => User)
  async user(@Args('id') id: string) {
    return this.usersService.findById(id);
    // Returns: { id, email, passwordHash, ssn, internalNotes, ... }
    // Exposes sensitive data!
  }
}

// Manual object spreading (error-prone)
@Query(() => User)
async user(@Args('id') id: string) {
  const user = await this.usersService.findById(id);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    // Easy to forget to exclude sensitive fields
  };
}
```

**Correct (use class-transformer with @Exclude and explicit types):**

```typescript
// Enable class-transformer globally
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  await app.listen(3000);
}

// Entity with serialization control
@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  name: string;

  @Column()
  @Exclude() // Never include in responses
  passwordHash: string;

  @Column({ nullable: true })
  @Exclude()
  ssn: string;

  @Column({ default: false })
  @Exclude({ toPlainOnly: true })
  isAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  @Exclude()
  internalNotes: string;
}

// GraphQL output type — controls what's exposed
@ObjectType()
export class UserType {
  @Field()
  id: string;

  @Field()
  email: string;

  @Field()
  name: string;

  @Field()
  @Transform(({ obj }) => obj.posts?.length || 0)
  postCount: number;
}

@ObjectType()
export class UserDetailType extends UserType {
  @Field()
  createdAt: Date;

  @Field(() => [PostType])
  posts: PostType[];
}

// Resolver with explicit types
@Resolver(() => User)
export class UsersResolver {
  @Query(() => [UserType])
  async users(): Promise<UserType[]> {
    const users = await this.usersService.findAll();
    return users.map(u => plainToInstance(UserType, u));
  }

  @Query(() => UserDetailType)
  async user(@Args('id') id: string): Promise<UserDetailType> {
    const user = await this.usersService.findByIdWithPosts(id);
    return plainToInstance(UserDetailType, user, {
      excludeExtraneousValues: true,
    });
  }
}

// Input types for mutations
@InputType()
export class CreateUserInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  password: string;
}

// Mapped types for variations
@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {}

@InputType()
export class UserFilterInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;
}

// Groups for conditional serialization
@ObjectType()
export class UserType {
  @Field()
  id: string;

  @Field()
  name: string;

  @Field({ description: 'Only visible to admins' })
  @Expose({ groups: ['admin'] })
  email: string;

  @Field()
  @Expose({ groups: ['admin'] })
  createdAt: Date;

  @Field()
  @Expose({ groups: ['admin', 'owner'] })
  settings: UserSettings;
}
```

Reference: [NestJS Serialization](https://docs.nestjs.com/techniques/serialization) | [GraphQL Mapped Types](https://docs.nestjs.com/graphql/mapped-types)
