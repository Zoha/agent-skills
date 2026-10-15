# NestJS GraphQL Application Structure

**Version 1.0.0**
NestJS GraphQL Structure
October 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

File-placement and anatomy guide for NestJS GraphQL applications, designed for AI agents and LLMs. Teaches where every file belongs in a feature-first, code-first codebase — the base structure map plus per-file rules for modules, services, resolvers, inputs, entities, repositories, loaders, and events — each with purpose, responsibilities, and incorrect-vs-correct examples. It also covers how modules connect to resolve GraphQL fields and relations, including module-resolution concerns such as circular dependencies, while deferring behavioral concerns to the nestjs-best-practices skill.

---

## Table of Contents

1. [Application Structure](#1-application-structure) — **CRITICAL**
   - 1.1 [Canonical Application Structure](#11-canonical-application-structure)
3. [Services](#3-services) — **HIGH**
   - 3.1 [Multiple Focused Services per Module](#31-multiple-focused-services-per-module)
4. [GraphQL Resolvers](#4-graphql-resolvers) — **HIGH**
   - 4.1 [Split Resolvers by Role into resolvers/](#41-split-resolvers-by-role-into-resolvers-)
5. [GraphQL Types & Inputs](#5-graphql-types-inputs) — **HIGH**
   - 5.1 [Define GraphQL Inputs in dto/](#51-define-graphql-inputs-in-dto-)
6. [Data Access](#6-data-access) — **MEDIUM-HIGH**
   - 6.1 [Place MongoDB Entities in entities/](#61-place-mongodb-entities-in-entities-)

---

## 1. Application Structure

**Section Impact: CRITICAL**

### 1.1 Canonical Application Structure

**Impact: CRITICAL** — the map every other placement rule hangs from

**Purpose.** This is the base map for a feature-first, code-first NestJS GraphQL application.
It shows where every kind of file belongs, at the application level and inside a feature
module. Consult it first when deciding where a new file goes; then read the per-file rule for
that kind of file for its purpose, responsibilities, and examples.

**How to read it.** `common/` holds reusable, feature-agnostic building blocks; `infra/` holds
one-time infrastructure imported by the composition root; `modules/<feature>/` holds one
bounded context each, and every *kind* of file inside it gets its own subfolder. Files marked
`OPTIONAL` exist only in the situations their rule describes.

```text
src/
├── main.ts                        # bootstrap only: create app, global pipes/filters/interceptors, listen
├── app.module.ts                  # composition root: imports feature + infra modules, no logic
├── config/
│   ├── app.config.ts              # typed config namespace (registerAs)
│   ├── database.config.ts         # typed config namespace
│   └── validation.schema.ts       # env validation (Joi/Zod) — fail fast
├── common/                        # feature-agnostic, reusable building blocks
│   ├── decorators/                # e.g. @CurrentUser()
│   ├── filters/                   # GraphQL exception filters
│   ├── guards/                    # shared auth/roles guards
│   ├── interceptors/              # logging, transform
│   ├── pipes/                     # shared validation/parse pipes
│   ├── scalars/                   # custom GraphQL scalars
│   └── utils/
├── infra/                         # one-time infrastructure, imported by the composition root
│   ├── database/
│   │   ├── database.module.ts     # DB connection module
│   │   ├── database.providers.ts  # provider/factory wiring
│   │   └── migrations/            # DB migrations
│   ├── graphql/
│   │   ├── graphql.module.ts      # GraphQLModule.forRootAsync + schema config
│   │   └── graphql.context.ts     # per-request context: user + DataLoaders
│   └── <cache|queue|…>/           # other one-time infra
└── modules/
    └── <feature>/                 # one folder per bounded context
        ├── <feature>.module.ts           # wiring: providers, imports, exports
        ├── resolvers/
        │   ├── <feature>.query.resolver.ts      # queries
        │   ├── <feature>.mutation.resolver.ts   # mutations
        │   └── <feature>.field.resolver.ts      # @ResolveField relations
        ├── services/
        │   └── <feature>.service.ts             # domain logic (multiple per module)
        ├── repositories/
        │   └── <feature>.repository.ts          # data access only
        ├── dto/
        │   ├── create-<feature>.input.ts        # @InputType (+class-validator)
        │   └── find-<feature>.args.ts           # @Args() class
        ├── entities/
        │   └── <feature>.entity.ts              # persistence + @ObjectType (merged default)
        ├── models/                              # OPTIONAL: GraphQL-only @ObjectType (split case)
        ├── mappers/                             # OPTIONAL: entity ⟷ model / _id → id
        ├── loaders/
        │   └── <feature>.loader.ts              # DataLoader(s) for relations
        ├── events/
        │   ├── <feature>-<action>.event.ts      # domain event
        │   └── <feature>-<action>.listener.ts   # listener
        └── guards/                              # OPTIONAL: feature-local guards/decorators
test/
└── <feature>.e2e-spec.ts          # e2e specs (unit specs are co-located)
```

**Consequences of the map.**

- A feature owns its own files; moving or deleting a feature is moving or deleting one folder.
- Cross-cutting code is never duplicated into features — it lives in `common/`.
- A new file kind is placed by its *role*, not by the feature it happens to serve first.

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

## 3. Services

**Section Impact: HIGH**

### 3.1 Multiple Focused Services per Module

**Impact: HIGH** — split by responsibility; a module usually has several services

**Purpose.** A module's business logic lives in its `services/` folder. A feature almost
always has more than one responsibility, so it should have more than one service. Each
service owns a single concern, which keeps files small, easy to test, and safe to change
without dragging in the rest of the feature.

**Placement.** `modules/<feature>/services/<feature>.service.ts`, plus
`<feature>-<concern>.service.ts` for each additional concern. Name the class after the
concern: `UsersService`, `UsersProfileService`, `UsersInvitationsService`.

**Responsibilities.**

- Expose the operations that resolvers and other modules need.
- Own the business rules for exactly one concern.
- Depend on repositories and other services through constructor injection.

**Never.**

- Contain GraphQL decorators (`@Query`, `@Resolver`) or HTTP/Express objects.
- Reach directly into the ORM/model — that is the repository's job.
- Mix unrelated concerns into one class because they share a name prefix.

**Incorrect (one god service):**

```typescript
// modules/users/services/users.service.ts — one class, five concerns
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwt: JwtService,
    private readonly mailer: MailerService,
    private readonly uploads: UploadService,
    private readonly reports: ReportService,
  ) {}

  findById(id: string) { /* user queries */ }
  login(email: string, password: string) { /* auth */ }
  uploadAvatar(id: string, file: Buffer) { /* media */ }
  sendPasswordReset(email: string) { /* notifications */ }
  buildActivityReport(id: string) { /* reporting */ }
}
```

Why it is wrong: every new concern grows the same class, its constructor pulls in half the
application, and testing any one behavior means mocking all five dependencies.

**Correct (focused services):**

```typescript
// modules/users/services/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new UserNotFoundException(id);
    return user;
  }
}

// modules/users/services/users-profile.service.ts
@Injectable()
export class UsersProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async updateProfile(id: string, input: UpdateUserInput): Promise<User> {
    return this.usersRepository.update(id, input);
  }
}
```

Why it is right: each service has one reason to change and one dependency set; the module
registers them side by side and each resolver depends only on the service it needs.

Reference: [NestJS Providers](https://docs.nestjs.com/providers)

---

## 4. GraphQL Resolvers

**Section Impact: HIGH**

### 4.1 Split Resolvers by Role into resolvers/

**Impact: HIGH** — thin, role-focused entry points

**Purpose.** Resolvers are the GraphQL entry points of a feature and live in its `resolvers/`
folder. Each resolver targets one type and one role — queries, mutations, or field relations
— stays thin, and delegates to services. Splitting by role keeps each file small and the
module's provider list readable.

**Placement.** `modules/<feature>/resolvers/<feature>.query.resolver.ts`,
`<feature>.mutation.resolver.ts`, `<feature>.field.resolver.ts`. For a very small feature a
single `<feature>.resolver.ts` covering queries and mutations is acceptable; split once a role
grows.

**Responsibilities.**

- Declare `@Query()`, `@Mutation()`, or `@ResolveField()` methods for one parent type.
- Translate arguments into service calls and return the result.
- Declare the parent type with `@Resolver(() => Feature)`.

**Never.**

- Contain business logic or direct model/repository access.
- Catch and reformat errors by hand — use exception filters.
- Register in `AppModule`; resolvers are providers of their own feature module.

**Incorrect (one class for everything, logic inline):**

```typescript
// resolvers/app.resolver.ts
@Resolver()
export class AppResolver {
  @Query(() => User)
  async user(@Args('id') id: string) {
    const user = await this.userModel.findById(id); // data access here
    if (!user) throw new Error('not found');
    user.lastSeen = new Date();
    await user.save();                               // business logic here
    return user;
  }

  @Mutation(() => User)
  async updateUser(@Args('id') id: string, @Args('name') name: string) {
    /* more of the same */
  }
}
```

Why it is wrong: one file owns every type, mixes layers, and declares no parent type, so
field resolvers have nowhere to live.

**Correct (role-split, thin resolvers):**

```typescript
// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User, { name: 'user' })
  async getUser(@Args('id', ParseObjectIdPipe) id: string): Promise<User> {
    return this.usersService.findById(id);
  }
}

// modules/users/resolvers/users.mutation.resolver.ts
@Resolver(() => User)
export class UsersMutationResolver {
  constructor(private readonly usersService: UsersService) {}

  @Mutation(() => User, { name: 'updateUser' })
  async updateUser(@Args('input') input: UpdateUserInput): Promise<User> {
    return this.usersService.update(input);
  }
}
```

Why it is right: each file is one type and one role, resolvers only translate and delegate,
and the parent type is declared once per class so field resolvers can attach.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

## 5. GraphQL Types & Inputs

**Section Impact: HIGH**

### 5.1 Define GraphQL Inputs in dto/

**Impact: HIGH** — validated inputs are the API boundary

**Purpose.** Mutation and query inputs are declared as code-first `@InputType()` classes and
live in the feature's `dto/` folder. They are the boundary where untrusted input is validated
and shaped, so they must carry validation and must never expose internal fields.

**Placement.** `modules/<feature>/dto/create-<feature>.input.ts`,
`update-<feature>.input.ts`. Class names end in `Input`.

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

---

## 6. Data Access

**Section Impact: MEDIUM-HIGH**

### 6.1 Place MongoDB Entities in entities/

**Impact: MEDIUM-HIGH** — one class per stored document, exposed only where safe

**Purpose.** A MongoDB document lives in the owning feature's `entities/` folder. In the
default (merged) case the same class is both the persistence schema and the GraphQL
`@ObjectType`, which keeps the two in sync for simple, one-to-one domain objects.

**Placement.** `modules/<feature>/entities/<feature>.entity.ts`. One entity per file; the
class name is singular and PascalCase (`User`).

**Responsibilities.**

- Define the document shape with `@Schema` and `@Prop`.
- Expose only safe fields to GraphQL with `@Field()`.
- Declare indexes on unique and frequently queried fields.
- Export the `SchemaFactory`-built schema.

**Never.**

- Live in a global `src/entities/` technical folder.
- Put `@Field()` on secrets (password hashes, tokens) — persist them, do not expose them.
- Let the merged class grow until the API shape and the stored shape diverge. That is the
  signal to split into `models/` + `mappers/` (see `data-models-mappers`).

**Incorrect (global folder, secrets exposed, no index):**

```typescript
// src/entities/user.entity.ts — outside its feature
@ObjectType()
@Schema()
export class User {
  @Field() email: string;
  @Field() passwordHash: string;   // exposed in the schema
  @Field() resetToken: string;     // exposed in the schema
  // no unique index on email -> full collection scans, duplicates allowed
}
```

Why it is wrong: the entity escapes its feature, and fields that must never leave the server
become part of the public graph.

**Correct (feature-local, safe exposure, indexed):**

```typescript
// modules/users/entities/user.entity.ts
export type UserDocument = HydratedDocument<User>;

@ObjectType()
@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Field(() => ID)
  _id: Types.ObjectId;

  @Field()
  @Prop({ required: true, unique: true, index: true })
  email: string;

  @Prop({ required: true, select: false }) // persisted, NOT a @Field
  passwordHash: string;

  @Prop({ select: false })                 // persisted, NOT a @Field
  resetToken?: string;

  @Field()
  @Prop({ required: true })
  name: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
```

Why it is right: the document lives with its feature, only safe fields reach the schema, and
the lookup column is indexed so queries do not scan the whole collection.

When the API shape stops matching storage — computed fields, relation-only fields, or secrets
that need a different exposure — keep the entity persistence-only and move the exposed type
to `models/` with a `mappers/` file. See `data-models-mappers`.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

## References

- https://docs.nestjs.com/modules
- https://docs.nestjs.com/graphql/resolvers
- https://docs.nestjs.com/graphql/mapped-types
- https://docs.nestjs.com/fundamentals/dynamic-modules
- https://docs.nestjs.com/techniques/mongodb
- https://docs.nestjs.com/cli/overview
- https://github.com/graphql/dataloader
- https://encore.dev/articles/nestjs-project-structure-best-practices

---

*Generated by build-agents.ts on 2026-10-15*
