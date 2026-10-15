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
2. [Modules & Bootstrap](#2-modules-bootstrap) — **CRITICAL**
   - 2.1 [The Feature Module File](#21-the-feature-module-file)
3. [Services](#3-services) — **HIGH**
   - 3.1 [Multiple Focused Services per Module](#31-multiple-focused-services-per-module)
4. [GraphQL Resolvers](#4-graphql-resolvers) — **HIGH**
   - 4.1 [Split Resolvers by Role into resolvers/](#41-split-resolvers-by-role-into-resolvers-)
5. [GraphQL Types & Inputs](#5-graphql-types-inputs) — **HIGH**
   - 5.1 [Define @Args Classes in dto/](#51-define-args-classes-in-dto-)
   - 5.2 [Define GraphQL Inputs in dto/](#52-define-graphql-inputs-in-dto-)
6. [Data Access](#6-data-access) — **MEDIUM-HIGH**
   - 6.1 [Place MongoDB Entities in entities/](#61-place-mongodb-entities-in-entities-)
   - 6.2 [Split models/ and mappers/ When API Differs From Storage](#62-split-models-and-mappers-when-api-differs-from-storage)
   - 6.3 [Keep Data Access in repositories/](#63-keep-data-access-in-repositories-)
7. [Relations & Cross-Module](#7-relations-cross-module) — **CRITICAL**
   - 7.1 [Resolve Circular Module Dependencies](#71-resolve-circular-module-dependencies)
   - 7.2 [Resolve Cross-Module Fields via the Owning Service](#72-resolve-cross-module-fields-via-the-owning-service)
   - 7.3 [Batch Relations with a Per-Request DataLoader](#73-batch-relations-with-a-per-request-dataloader)
   - 7.4 [Decouple Modules with Events](#74-decouple-modules-with-events)
   - 7.5 [Resolve Relations with @ResolveField](#75-resolve-relations-with-resolvefield)

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

## 2. Modules & Bootstrap

**Section Impact: CRITICAL**

### 2.1 The Feature Module File

**Impact: CRITICAL** — a module declares its own providers and exports

**Purpose.** `<feature>.module.ts` wires a feature together: it declares the feature's
providers (resolvers, services, repositories), imports what those providers need, and exports
the small set of providers other modules may inject. The module is the feature's public
interface.

**Placement.** `modules/<feature>/<feature>.module.ts`. Class name `<Feature>Module`.

**Responsibilities.**

- List resolvers, services, and repositories in `providers`.
- Import the modules whose exported providers this feature injects (for example
  `MongooseModule.forFeature([...])` or another feature module).
- Export only the providers other modules need.
- Register feature-local listeners, guards, and other providers.

**Never.**

- Register feature providers in `AppModule` directly.
- Export everything by default.
- Put business logic or configuration in the module class.

**Incorrect (everything in AppModule, everything exported):**

```typescript
// app.module.ts — every feature provider registered here
@Module({
  providers: [UsersService, UsersResolver, UsersRepository, OrdersService, OrdersResolver],
})
export class AppModule {}

// modules/users/users.module.ts — exports everything "just in case"
@Module({
  providers: [UsersService, UsersRepository, UsersResolver],
  exports: [UsersService, UsersRepository, UsersResolver],
})
export class UsersModule {}
```

Why it is wrong: `AppModule` becomes the wiring for every feature, so nothing is
encapsulated, and exporting the repository and resolver turns internals into public API.

**Correct (feature wires itself, minimal exports):**

```typescript
// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [
    UsersService,
    UsersProfileService,
    UsersRepository,
    UsersQueryResolver,
    UsersMutationResolver,
  ],
  exports: [UsersService], // only what other modules inject
})
export class UsersModule {}

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GraphQLModule,
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
```

Why it is right: the feature owns its wiring, exposes a minimal interface, and `AppModule`
only lists features and infrastructure.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

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

### 5.1 Define @Args Classes in dto/

**Impact: HIGH** — group and validate operation arguments

**Purpose.** When an operation takes more than one or two arguments, or the arguments form a
logical group (pagination, filters, sorting), define an `@ArgsType()` class in the feature's
`dto/` folder instead of a list of raw `@Args('x')` scalars. It groups and validates the
arguments the same way `@InputType` does for inputs.

**Placement.** `modules/<feature>/dto/find-<feature>.args.ts`. Class names end in `Args`.

**Responsibilities.**

- Group related arguments on one `@ArgsType()` class.
- Validate each field with `class-validator`.
- Supply sensible defaults (for example page or limit).

**Never.**

- Scatter many raw `@Args('field')` scalars across a resolver.
- Accept unvalidated filter or sort strings straight from the client.
- Reuse an `@InputType` class as an args type (or vice versa) just to avoid a file.

**Incorrect (raw, unvalidated arguments):**

```typescript
@Query(() => [User])
users(
  @Args('search') search: string,
  @Args('page') page: number,
  @Args('limit') limit: number,
  @Args('sort') sort: string,
) {
  // every argument raw and unvalidated, defaults are ad hoc
  return this.usersService.findAll({ search, page, limit, sort });
}
```

Why it is wrong: argument handling is repeated in every resolver, nothing is validated, and
paging defaults are handled per call site.

**Correct (one validated args type, defaults included):**

```typescript
// dto/find-users.args.ts
@ArgsType()
export class FindUsersArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString() @MaxLength(100)
  search?: string;

  @Field(() => Int, { defaultValue: 1 })
  @Type(() => Number)
  @IsInt() @Min(1)
  page = 1;

  @Field(() => Int, { defaultValue: 20 })
  @Type(() => Number)
  @IsInt() @Min(1) @Max(100)
  limit = 20;
}

@Query(() => [User])
users(@Args() args: FindUsersArgs) {
  return this.usersService.findAll(args);
}
```

Why it is right: the argument group is one validated, reusable, named type with sensible
defaults, and the resolver stays a one-line translation.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 5.2 Define GraphQL Inputs in dto/

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

### 6.2 Split models/ and mappers/ When API Differs From Storage

**Impact: MEDIUM-HIGH** — keep the public graph decoupled from the database

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

---

### 6.3 Keep Data Access in repositories/

**Impact: MEDIUM-HIGH** — services stay free of ORM detail

**Purpose.** A repository is the only place in a feature that talks to the database. It wraps
the model/ORM and exposes intention-revealing methods. Services depend on the repository;
nothing else touches the model.

**Placement.** `modules/<feature>/repositories/<feature>.repository.ts`. Class name
`<Feature>Repository`.

**Responsibilities.**

- Encapsulate every model/ORM call (queries, updates, transactions).
- Return domain entities to callers.
- Accept plain arguments and filter objects.

**Never.**

- Contain business rules or GraphQL types.
- Leak the raw model or query builder to callers.
- Be exported to other modules as a shared data layer — other modules go through services.

**Incorrect (ORM calls and a query pipeline inlined in the service):**

```typescript
// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async findActiveWithOrders(minOrders: number) {
    return this.userModel.aggregate([
      { $match: { isActive: true } },
      { $lookup: { from: 'orders', localField: '_id', foreignField: 'userId', as: 'orders' } },
      { $match: { 'orders.0': { $exists: true } } },
      // ... a long pipeline living in business code
    ]);
  }
}
```

Why it is wrong: the service owns persistence detail, so changing the query or the store means
editing business code, and the query cannot be reused or tested in isolation.

**Correct (repository encapsulates persistence, service reads as intent):**

```typescript
// repositories/users.repository.ts
@Injectable()
export class UsersRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  findActiveWithMinOrders(minOrders: number): Promise<UserDocument[]> {
    return this.userModel.aggregate([/* pipeline */]).exec();
  }

  create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }
}

// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findActiveWithOrders(): Promise<User[]> {
    return this.usersRepository.findActiveWithMinOrders(1);
  }
}
```

Why it is right: persistence detail lives in one place; the service reads as business intent
and depends on an injected repository that is trivial to mock.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [Repository pattern](https://martinfowler.com/eaaCatalog/repository.html)

---

## 7. Relations & Cross-Module

**Section Impact: CRITICAL**

### 7.1 Resolve Circular Module Dependencies

**Impact: CRITICAL** — a cycle is an architecture bug, not a wiring problem

**Purpose.** A circular dependency is when module A imports module B and B imports A, directly
or transitively. It is an architecture problem: the two modules are really one, or the shared
piece belongs in a third module. Fix the structure first; `forwardRef` is a last resort that
hides the cycle rather than removing it.

**Placement.** The fix is structural — extract a shared module, invert the dependency with
events, or depend on a service contract.

**Responsibilities.**

- Model the module graph as a directed acyclic graph (no cycles).
- Extract genuinely shared logic into its own module that both sides import.
- Break behavioural cycles with events or a token-provided contract.

**Never.**

- Reach for `forwardRef` as the first answer.
- Merge two features into one large module just to silence the warning.
- Resolve providers through `ModuleRef` to dodge the error.

**Incorrect (two modules importing each other):**

```typescript
// orders.module.ts
@Module({ imports: [UsersModule], providers: [OrdersService] })
export class OrdersModule {}

// users.module.ts
@Module({ imports: [OrdersModule], providers: [UsersService] })
export class UsersModule {}
```

Why it is wrong: the two modules cannot be reasoned about or tested separately, and the cycle
usually exists because each needs one small thing the other owns.

**Correct (extract the shared dependency, or invert with events):**

```typescript
// shared/profile.module.ts — the thing both actually need
@Module({ providers: [ProfileService], exports: [ProfileService] })
export class ProfileModule {}

// orders.module.ts
@Module({ imports: [ProfileModule], providers: [OrdersService] })
export class OrdersModule {}

// users.module.ts
@Module({ imports: [ProfileModule], providers: [UsersService] })
export class UsersModule {}

// When one module only needs to *react* to the other, use an event instead of importing it:
// users emits 'user.created'; orders listens with @OnEvent('user.created').
```

Why it is right: the shared concern moves to a module both sides import without cycling, and
one-directional reactions use events, so the module graph stays acyclic.

`forwardRef(() => X)` is acceptable only as a documented last resort — when neither a shared
module nor events are possible — and the cycle should be recorded as debt to remove.

Reference: [NestJS Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency)

---

### 7.2 Resolve Cross-Module Fields via the Owning Service

**Impact: CRITICAL** — the module boundary stays intact

**Purpose.** When a field on one type is backed by data owned by another feature (`User.orders`
backed by the orders feature), resolve it by injecting the owning module's exported service or
loader. Import that module; never reach into its repository, entity, or model. This keeps each
module's data private and its public interface explicit.

**Placement.** The field resolver lives in the type-owning module
(`modules/users/resolvers/users.field.resolver.ts`); its dependency comes from
`modules/orders/` and arrives through `OrdersModule`'s `exports`.

**Responsibilities.**

- Import the owning module in this module's `imports`.
- Inject the owning module's exported service (or a loader that wraps it).
- Depend on a service contract, not on another module's storage.

**Never.**

- Import another feature's repository, entity, or model directly.
- Reach into another module's collection or table.
- Create a circular import to obtain the dependency (see `relations-avoid-circular`).

**Incorrect (reaching into another feature's data layer):**

```typescript
// users feature declares the orders schema and model itself
@Module({ imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])] })
export class UsersModule {}

@Resolver(() => User)
export class UsersFieldResolver {
  constructor(@InjectModel(Order.name) private orderModel: Model<OrderDocument>) {}

  @ResolveField(() => [Order])
  orders(@Parent() user: User) {
    return this.orderModel.find({ userId: user._id }); // users now owns orders data
  }
}
```

Why it is wrong: two features own the orders collection, the module boundary is gone, and the
orders feature can no longer change its storage safely.

**Correct (import the owning module, inject its exported loader):**

```typescript
// OrdersModule exports OrdersLoader
@Module({ imports: [OrdersModule] })
export class UsersModule {}

@Resolver(() => User)
export class UsersFieldResolver {
  constructor(private readonly ordersLoader: OrdersLoader) {}

  @ResolveField(() => [Order])
  orders(@Parent() user: User): Promise<Order[]> {
    return this.ordersLoader.loadByUserId(user._id.toString());
  }
}
```

Why it is right: the orders feature owns orders data and exposes one entry point; the users
feature depends on that contract, so the boundary stays intact and orders storage can change
freely.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

---

### 7.3 Batch Relations with a Per-Request DataLoader

**Impact: CRITICAL** — eliminates N+1 on relational fields

**Purpose.** A field resolver runs once per parent, so a naive implementation issues one query
per parent — the N+1 problem. A `DataLoader` batches those per-parent loads within a single
tick into one query and memoizes them for the request. Loaders live in the feature's `loaders/`
folder, are created per request, and are exposed through the GraphQL context.

**Placement.** `modules/<feature>/loaders/<feature>.loader.ts`; wired in
`infra/graphql/graphql.context.ts`.

**Responsibilities.**

- Define a `DataLoader` keyed on the parent id.
- Batch the keys into one repository/service call.
- Return results in the same order as the input keys.
- Be instantiated once per request, never as an application singleton.

**Never.**

- Hold a `DataLoader` as a singleton — its cache would leak data across requests.
- Issue a query per parent inside a field resolver.
- Ignore the ordering contract; `DataLoader` requires results in input-key order.

**Incorrect (singleton loader that still issues N queries):**

```typescript
@Injectable()
export class OrdersLoader {
  readonly byUser = new DataLoader(async (userIds) =>
    Promise.all(userIds.map((id) => this.ordersService.findByUser(id))), // still N queries
  );
}
```

Why it is wrong: as a singleton, one request's cached data can be served to another, and the
batch function still issues one query per key, so N+1 is not solved.

**Correct (request-scoped loader that batches into one query):**

```typescript
// loaders/orders.loader.ts
@Injectable({ scope: Scope.REQUEST })
export class OrdersLoader {
  constructor(private readonly ordersService: OrdersService) {}

  private readonly byUser = new DataLoader<string, Order[]>(async (userIds) => {
    const orders = await this.ordersService.findByUserIds([...userIds]); // ONE query
    const grouped = new Map<string, Order[]>();
    for (const order of orders) {
      const list = grouped.get(order.userId) ?? [];
      list.push(order);
      grouped.set(order.userId, list);
    }
    return userIds.map((id) => grouped.get(id) ?? []);
  });

  loadByUserId(id: string): Promise<Order[]> {
    return this.byUser.load(id);
  }
}
```

Why it is right: all per-parent loads in one tick collapse into a single query, results come
back in input-key order, and request scope confines the cache to one request.

Reference: [graphql/dataloader](https://github.com/graphql/dataloader)

---

### 7.4 Decouple Modules with Events

**Impact: HIGH** — react without importing

**Purpose.** When one module should react to something another module did — send a welcome
email after a user is created — without importing it, emit an event from the actor and listen
in the reactor. Event payloads and listeners live in the feature's `events/` folder. This keeps
the dependency one-directional and stops the actor's constructor from growing with every new
reaction.

**Placement.** `modules/<feature>/events/<feature>-<action>.event.ts` (payload class) and
`<feature>-<action>.listener.ts` (the `@OnEvent` handler, in the reacting module).

**Responsibilities.**

- Define the event payload as an explicit class.
- Emit with `EventEmitter2` from the service that performs the action.
- Register listeners in the reacting module.

**Never.**

- Use an event when a return value is needed — that is a request/response call; use the owning
  service instead.
- Emit from a resolver; emit from the service that owns the state change.
- Import the reacting module just so the actor can call it.

**Incorrect (the actor imports and calls every reactor):**

```typescript
@Injectable()
export class UsersService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.usersRepository.create(input);
    await this.notifications.sendWelcome(user); // actor knows every reactor
    await this.analytics.trackSignup(user);
    await this.audit.record('user.created', user);
    return user;
  }
}
```

Why it is wrong: every new reaction edits the users service, and the service depends on modules
it should not know about.

**Correct (emit once, react independently):**

```typescript
// events/user-created.event.ts
export class UserCreatedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
  ) {}
}

// services/users.service.ts
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const user = await this.usersRepository.create(input);
    this.events.emit('user.created', new UserCreatedEvent(user.id, user.email));
    return user;
  }
}

// events/user-created.listener.ts (in the notifications module)
@Injectable()
export class UserCreatedListener {
  @OnEvent('user.created')
  async handle(event: UserCreatedEvent): Promise<void> {
    await this.notifications.sendWelcome(event.email);
  }
}
```

Why it is right: the users service emits and moves on, and each new reaction is a new listener
that never touches the actor.

For a synchronous cross-module dependency where a value is needed, inject the owning module's
exported service instead (see `relations-cross-module-service`).

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)

---

### 7.5 Resolve Relations with @ResolveField

**Impact: CRITICAL** — resolve relations on demand, not eagerly

**Purpose.** A relation that points from one object to another (author → posts, user → orders)
is resolved with an `@ResolveField` method on the owning type's resolver, not by eager-loading
everything in the parent query. The field resolver receives the parent object via `@Parent`
and returns the related data, usually by delegating to a loader (see `relations-dataloader`).

**Placement.** `modules/<feature>/resolvers/<feature>.field.resolver.ts`. The method name
matches the GraphQL field.

**Responsibilities.**

- Declare `@ResolveField(() => [Other])` for a relational field.
- Read the parent id with `@Parent()`.
- Delegate to a loader or the owning module's service.

**Never.**

- Eager-load every relation in the query resolver.
- Query the database once per parent inside the field resolver (that is N+1 — see
  `relations-dataloader`).
- Declare the field resolver for another module's type here; the type's owner declares it.

**Incorrect (every relation eager-loaded for every query):**

```typescript
@Query(() => User)
async user(@Args('id') id: string) {
  return this.userModel
    .findById(id)
    .populate(['orders', 'posts', 'followers', 'comments']); // loads all, asked or not
}
```

Why it is wrong: the query does work the client did not request and pays for it on every call.

**Correct (resolve the field on demand, from the parent id):**

```typescript
// resolvers/users.field.resolver.ts
@Resolver(() => User)
export class UsersFieldResolver {
  constructor(private readonly ordersLoader: OrdersLoader) {}

  @ResolveField(() => [Order])
  orders(@Parent() user: User): Promise<Order[]> {
    return this.ordersLoader.loadByUserId(user._id.toString());
  }
}
```

Why it is right: the relation is resolved only when the client asks for the field, using the
parent object already in hand and a batched loader rather than a per-parent query.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

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
