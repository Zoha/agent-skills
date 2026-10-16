---
title: Inject a Model Only in the Repository
impact: HIGH
impactDescription: the model token stops at the data layer
tags: mongoose, injectmodel, repository, di, layering
---

## Inject a Model Only in the Repository

**Impact: HIGH (the model token stops at the data layer)**

**Purpose.** A NestJS Mongoose model (`Model<Doc>`) is obtained with `@InjectModel(...)`. That
injection marks the boundary of the data layer: **only the repository receives the model**.
Resolvers depend on services; services depend on repositories; repositories depend on the model.
Nothing above the repository knows a Mongoose model exists, so the ORM never leaks into business
logic, GraphQL types, or tests. This is the injection-side counterpart to `data-repository`.

**Placement.** `@InjectModel` is written once per entity, in
`modules/<feature>/repositories/<feature>.repository.ts`. The module makes the model available by
importing `MongooseModule.forFeature([{ name: X.name, schema: XSchema }])`.

**Responsibilities.**

- Inject the model exactly once per entity, in the repository constructor, as `private readonly`.
- Express every read and write as a repository method with a domain signature.
- Keep the model instance private to the repository — never return it or accept it as a parameter.
- Have services inject the repository, and resolvers inject the service.

**Never.**

- Inject a model into a **service**, **resolver**, **loader**, or **provider** — inject the
  repository instead.
- Let `Model<...>`, a query builder, or an aggregation type appear in a service or resolver
  signature.
- Register the model in `AppModule` or export it from the module — the repository encapsulates it.

**Incorrect (the service injects the model and builds the query):**

```typescript
// services/users.service.ts — reaches straight through to Mongoose
@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async findActive(): Promise<UserDocument[]> {
    return this.userModel.find({ isActive: true }).exec(); // ORM detail in business code
  }
}
```

Why it is wrong: the model token escapes the data layer, so business code owns query detail, the
service is welded to Mongoose, and the query cannot be stubbed without a real model.

**Correct (model -> repository -> service -> resolver, one direction):**

```typescript
// repositories/users.repository.ts — the only place the model exists
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findActive(): Promise<UserDocument[]> {
    return this.userModel.find({ isActive: true }).exec();
  }
}

// services/users.service.ts — depends on the repository, not the model
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findActive(): Promise<UserDocument[]> {
    return this.usersRepository.findActive();
  }
}

// resolvers/users.query.resolver.ts — depends on the service
@Query(() => [User])
findActiveUsers(): Promise<UserDocument[]> {
  return this.usersService.findActive();
}

// users.module.ts — the model provider and the repository live together
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersRepository, UsersService, UsersQueryResolver],
  exports: [UsersService],
})
export class UsersModule {}
```

Why it is right: the model is injected in exactly one place, the dependency chain flows
model -> repository -> service -> resolver, and any layer above the repository can be tested with a
stubbed repository.

Discriminator subtypes follow the same rule — inject each subtype's model in the repository; see
`data-discriminators`.

Reference: [NestJS MongoDB — Model injection](https://docs.nestjs.com/techniques/mongodb#model-injection) | [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-repository-pattern`.
