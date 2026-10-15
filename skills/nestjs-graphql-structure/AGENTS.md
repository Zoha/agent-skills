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
   - 1.2 [File Placement Table](#12-file-placement-table)
   - 1.3 [Locate and Policy the Generated Schema Artifact](#13-locate-and-policy-the-generated-schema-artifact)
2. [Modules & Bootstrap](#2-modules-bootstrap) — **CRITICAL**
   - 2.1 [Keep main.ts and app.module.ts Thin](#21-keep-main-ts-and-app-module-ts-thin)
   - 2.2 [Export Only the Feature's Public API (Its Services)](#22-export-only-the-feature-s-public-api-its-services-)
   - 2.3 [The Feature Module File](#23-the-feature-module-file)
3. [Services](#3-services) — **HIGH**
   - 3.1 [Multiple Focused Services per Module](#31-multiple-focused-services-per-module)
   - 3.2 [Keep Service Methods Small and Focused](#32-keep-service-methods-small-and-focused)
4. [GraphQL Resolvers](#4-graphql-resolvers) — **HIGH**
   - 4.1 [Declare Fields on the Type; Resolve Computed Ones in the Resolver](#41-declare-fields-on-the-type-resolve-computed-ones-in-the-resolver)
   - 4.2 [Split Resolvers by Role into resolvers/](#42-split-resolvers-by-role-into-resolvers-)
   - 4.3 [One Resolver File per Type That Has Field Resolvers](#43-one-resolver-file-per-type-that-has-field-resolvers)
5. [GraphQL Types & Inputs](#5-graphql-types-inputs) — **HIGH**
   - 5.1 [Define @Args Classes in dto/](#51-define-args-classes-in-dto-)
   - 5.2 [Define GraphQL Inputs in dto/](#52-define-graphql-inputs-in-dto-)
6. [Data Access](#6-data-access) — **MEDIUM-HIGH**
   - 6.1 [Place MongoDB Entities in entities/](#61-place-mongodb-entities-in-entities-)
   - 6.2 [Split models/ and mappers/ When API Differs From Storage](#62-split-models-and-mappers-when-api-differs-from-storage)
   - 6.3 [Keep Data Access in repositories/](#63-keep-data-access-in-repositories-)
7. [Relations & Cross-Module](#7-relations-cross-module) — **CRITICAL**
   - 7.1 [Resolve Circular Module Dependencies](#71-resolve-circular-module-dependencies)
   - 7.2 [Batch Relations with a Per-Request DataLoader](#72-batch-relations-with-a-per-request-dataloader)
   - 7.3 [Decouple Modules with Events](#73-decouple-modules-with-events)
   - 7.4 [Resolve Relations with @ResolveField](#74-resolve-relations-with-resolvefield)
   - 7.5 [Put a Relation Field in the Module That Owns Its Data](#75-put-a-relation-field-in-the-module-that-owns-its-data)
8. [Config, Common & Infra](#8-config-common-infra) — **MEDIUM**
   - 8.1 [Put Shared Building Blocks in common/](#81-put-shared-building-blocks-in-common-)
   - 8.2 [Put Typed Configuration in config/](#82-put-typed-configuration-in-config-)
   - 8.3 [Put Database Setup and Migrations in infra/database/](#83-put-database-setup-and-migrations-in-infra-database-)
   - 8.4 [Put GraphQL Setup in infra/graphql/](#84-put-graphql-setup-in-infra-graphql-)
9. [Conventions & Testing](#9-conventions-testing) — **MEDIUM**
   - 9.1 [Use the Nest CLI Generator, Then Adjust](#91-use-the-nest-cli-generator-then-adjust)
   - 9.2 [Keep Constants and Enums Out of Class Files](#92-keep-constants-and-enums-out-of-class-files)
   - 9.3 [File and Class Naming Conventions](#93-file-and-class-naming-conventions)
   - 9.4 [Test File Placement](#94-test-file-placement)

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
│   │   └── graphql.context.ts     # per-request context: request + authenticated user
│   └── <cache|queue|…>/           # other one-time infra
└── modules/
    └── <feature>/                 # one folder per bounded context
        ├── <feature>.module.ts           # wiring: providers, imports, exports
        ├── resolvers/
        │   ├── <feature>.query.resolver.ts      # queries
        │   ├── <feature>.mutation.resolver.ts   # mutations
        │   ├── <type>-<feature>.resolver.ts      # @ResolveField extending another module's type (data owner owns the field)
        │   └── <type>.resolver.ts                # @ResolveField for a nested/computed type of this module
        ├── services/
        │   └── <feature>.service.ts             # domain logic (multiple per module)
        ├── repositories/
        │   └── <feature>.repository.ts          # data access only
        ├── dto/
        │   ├── create-<feature>.input.ts        # @InputType (+class-validator)
        │   └── find-<feature>.args.ts           # @Args() class
        ├── constants/                           # constants and enums (no stray values in class files)
        │   └── <feature>-status.enum.ts
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

### 1.2 File Placement Table

**Impact: HIGH** — one lookup answers "where does this file go?"

**Purpose.** A single lookup from file kind to folder. Use it when you know what you are
creating but not where it belongs; the base structure rule (`struct-canonical-layout`) shows the
full tree, and the linked rule gives the file's purpose and examples.

**Placement.** This rule is the index; each row points to the rule that owns the file kind.

| File kind | Location | Rule |
|-----------|----------|------|
| Feature module | `modules/<f>/<f>.module.ts` | `module-feature-module` |
| Query resolver | `modules/<f>/resolvers/<f>.query.resolver.ts` | `resolver-organization` |
| Mutation resolver | `modules/<f>/resolvers/<f>.mutation.resolver.ts` | `resolver-organization` |
| Relation field resolver | `modules/<f>/resolvers/<type>-<f>.resolver.ts` | `relations-field-resolvers`, `relations-owning-module` |
| Nested/computed field resolver | `modules/<f>/resolvers/<type>.resolver.ts` | `resolver-per-type` |
| Domain service | `modules/<f>/services/<f>.service.ts` | `service-single-responsibility` |
| Custom repository | `modules/<f>/repositories/<f>.repository.ts` | `data-repository` |
| GraphQL input | `modules/<f>/dto/create-<f>.input.ts` | `type-inputs` |
| GraphQL args | `modules/<f>/dto/find-<f>.args.ts` | `type-args` |
| Constants / enums | `modules/<f>/constants/` | `conventions-constants-enums` |
| Persistence entity / object type | `modules/<f>/entities/<f>.entity.ts` | `data-entity-mongodb` |
| GraphQL-only model (split) | `modules/<f>/models/<f>.model.ts` | `data-models-mappers` |
| Mapper | `modules/<f>/mappers/<f>.mapper.ts` | `data-models-mappers` |
| DataLoader | `modules/<f>/loaders/<f>.loader.ts` | `relations-dataloader` |
| Domain event / listener | `modules/<f>/events/` | `relations-events` |
| Config namespace | `config/` | `infra-config` |
| Shared guard/filter/interceptor/pipe/scalar | `common/` | `infra-common` |
| GraphQL setup / context | `infra/graphql/` | `infra-graphql` |
| DB setup / migrations | `infra/database/` | `infra-database` |
| Bootstrap | `main.ts` | `module-bootstrap` |
| Composition root | `app.module.ts` | `module-bootstrap` |
| Generated SDL | path from `autoSchemaFile` | `struct-schema-artifact` |
| Unit test | co-located `<name>.spec.ts` | `conventions-testing` |
| E2E test | `test/<f>.e2e-spec.ts` | `conventions-testing` |

**Never.**

- Invent a new folder for a file kind that already has a home above.
- Place a file by the feature that first needs it rather than by its role.

Every file kind resolves to exactly one folder here, so placement has a deterministic answer and
the structure stays consistent as the app grows.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

---

### 1.3 Locate and Policy the Generated Schema Artifact

**Impact: MEDIUM** — the SDL is generated, not hand-edited

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
  id: ID!
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
  @Field() id: string;
  @Field() email: string;
  @Field() nickname: string;
}
// schema.gql is regenerated from this at startup/build and reviewed as a diff
```

Why it is right: the schema is derived from the code, the artifact always reflects the code,
and its diff shows exactly what changed in the public API.

Reference: [NestJS GraphQL Quick Start](https://docs.nestjs.com/graphql/quick-start)

---

## 2. Modules & Bootstrap

**Section Impact: CRITICAL**

### 2.1 Keep main.ts and app.module.ts Thin

**Impact: CRITICAL** — bootstrap and composition, nothing else

**Purpose.** `main.ts` creates the application and registers cross-cutting concerns — global
pipes, filters, and interceptors. `app.module.ts` is the composition root: it imports feature
modules and infrastructure modules. Neither contains business logic or feature wiring.

**Placement.** `src/main.ts`, `src/app.module.ts`.

**Responsibilities.**

- `main.ts`: create the app, register global pipes/filters/interceptors, enable shutdown hooks,
  listen.
- `app.module.ts`: import config, infrastructure, and feature modules.

**Never.**

- Register a feature's providers in `AppModule`.
- Put domain logic in `main.ts`.
- List individual providers rather than importing the modules that own them.

**Incorrect (logic in bootstrap, feature internals in AppModule):**

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const user = await app.get(UsersService).findById('1'); // domain work in bootstrap
  app.listen(3000);
}

// app.module.ts — lists every provider of every feature
@Module({ providers: [UsersService, OrdersService, UsersRepository] })
export class AppModule {}
```

Why it is wrong: `main.ts` does work that belongs to a service, and `AppModule` knows feature
internals it should never see.

**Correct (bootstrap and composition only):**

```typescript
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GraphqlInfraModule,
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
```

Why it is right: `main.ts` only bootstraps and registers global concerns; `AppModule` lists
modules, not providers, so each feature stays encapsulated.

Reference: [NestJS First Steps](https://docs.nestjs.com/first-steps) | [NestJS Modules](https://docs.nestjs.com/modules)

---

### 2.2 Export Only the Feature's Public API (Its Services)

**Impact: HIGH** — one narrow entry point; internals stay private

**Purpose.** A module's `exports` array is the feature's public API. In practice that is the
feature's **service(s)** — the entry point other modules inject — plus any module it deliberately
re-exports. Everything else the feature owns stays private. A wide export surface couples other
features to your internals and makes change expensive.

**Placement.** The `exports` array of `modules/<feature>/<feature>.module.ts`.

**Responsibilities.**

- Export the service(s) other modules need to inject.
- Re-export an imported module when you deliberately want to share its providers.
- Keep the export list as small as the feature's public API allows.

**Never.**

- Export a **repository** — data access stays behind the service.
- Export a **resolver** — it is an entry point, not a dependency others inject.
- Export an **entity, model, or input** — these are TypeScript types; import them directly, do
  not route them through a module's `exports`.
- Export a **loader** — a consumer that needs batching declares its own loader over the injected
  service (see `relations-dataloader`).

Guards are not published through `exports` either: a guard is a class you import directly and
attach with `@UseGuards(...)`, or register globally with `APP_GUARD`.

**Incorrect (the whole feature is public):**

```typescript
// modules/users/users.module.ts
@Module({
  providers: [UsersService, UsersRepository, UsersQueryResolver, UserOrdersLoader],
  exports: [UsersService, UsersRepository, UsersQueryResolver, UserOrdersLoader], // all internals
})
export class UsersModule {}
```

Why it is wrong: other modules can now depend on the repository, the resolver, and the loader —
none of those can change without breaking consumers, and the module has no private area.

**Correct (one public entry point):**

```typescript
// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersService, UsersRepository, UsersQueryResolver, UsersFieldResolver],
  exports: [UsersService], // the feature's public API
})
export class UsersModule {}

// A consumer imports the module and injects only the service
@Module({ imports: [UsersModule] })
export class OrdersModule {}

@Injectable()
export class OrdersService {
  constructor(private readonly usersService: UsersService) {} // the one allowed dependency
}
```

Why it is right: consumers see exactly one dependency (`UsersService`); the repository, resolvers,
and other internals can change freely; and a provider is shared by re-exporting a module rather
than widening the export list.

Reference: [NestJS Modules — Shared modules](https://docs.nestjs.com/modules#shared-modules) | [NestJS Modules — Re-exporting](https://docs.nestjs.com/modules#module-re-exporting)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-module-sharing`.

---

### 2.3 The Feature Module File

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

**Behavioral depth.** See `nestjs-best-practices` -> `arch-feature-modules` and `arch-module-sharing`.

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

**Behavioral depth.** See `nestjs-best-practices` -> `arch-single-responsibility`.

---

### 3.2 Keep Service Methods Small and Focused

**Impact: HIGH** — easier to read, test, and change

**Purpose.** A service method should do one thing at one level of abstraction. A method that
validates, queries, maps, charges, and notifies is hard to read, hard to test, and changes for
many reasons. Extract each step into a private method, and move a genuinely separate concern into
its own service.

**Placement.** Within the feature's `services/` files.

**Responsibilities.**

- Keep one purpose per method; the public method orchestrates, private helpers do the steps.
- Keep each method at a single level of abstraction.
- Move a separate concern into another service (see `service-single-responsibility`).

**Never.**

- Write one method that performs several unrelated operations.
- Nest conditionals many levels deep or build a long sequential script in one method.
- Mix validation, persistence, mapping, and side effects in one block.

Heuristic: if you cannot describe a method without saying "and", it is more than one method. As a
rough guide, a method that runs past ~40 lines, nests more than ~3 levels, or needs scrolling to
read should be split.

**Incorrect (one long method doing everything):**

```typescript
@Injectable()
export class OrdersService {
  async createOrder(input: CreateOrderInput): Promise<Order> {
    // validate
    if (!input.items.length) throw new BadRequestException('empty');
    for (const item of input.items) {
      if (item.qty <= 0) throw new BadRequestException('bad qty');
    }
    // price
    let total = 0;
    for (const item of input.items) {
      const product = await this.productRepo.findById(item.productId);
      total += product.price * item.qty;
    }
    // discount
    if (input.coupon) {
      const coupon = await this.couponRepo.findByCode(input.coupon);
      if (coupon && coupon.expiresAt > new Date()) total *= 1 - coupon.rate;
    }
    // persist
    const order = await this.orderRepo.save({ ...input, total });
    // notify
    await this.mailer.send(order.customerEmail, 'Order placed');
    this.events.emit('order.created', order);
    return order;
  }
}
```

Why it is wrong: five concerns in one method, so pricing cannot be tested without the database,
the mailer, and the event bus.

**Correct (public method orchestrates, distinct concerns delegated):**

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly pricing: OrdersPricingService,
    private readonly ordersRepository: OrdersRepository,
    private readonly events: EventEmitter2,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    this.validate(input);
    const total = await this.pricing.calculateTotal(input.items, input.coupon);
    const order = await this.ordersRepository.create({ ...input, total });
    this.events.emit('order.created', new OrderCreatedEvent(order.id, order.customerEmail));
    return order;
  }

  private validate(input: CreateOrderInput): void {
    if (!input.items.length) throw new BadRequestException('empty order');
    if (input.items.some((i) => i.qty <= 0)) throw new BadRequestException('invalid quantity');
  }
}

// services/orders-pricing.service.ts — its own concern, testable on its own
@Injectable()
export class OrdersPricingService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly couponsRepository: CouponsRepository,
  ) {}

  async calculateTotal(items: OrderItem[], couponCode?: string): Promise<number> {
    const subtotal = await this.subtotal(items);
    return couponCode ? this.applyCoupon(subtotal, couponCode) : subtotal;
  }

  // ...private subtotal() / applyCoupon() helpers
}
```

Why it is right: each method does one thing, the public method reads as a short story, and pricing
is a separate service you can test without the database or the mailer.

Reference: [NestJS Providers](https://docs.nestjs.com/providers) | [Single Responsibility Principle](https://en.wikipedia.org/wiki/Single-responsibility_principle)

---

## 4. GraphQL Resolvers

**Section Impact: HIGH**

### 4.1 Declare Fields on the Type; Resolve Computed Ones in the Resolver

**Impact: HIGH** — one source of truth per field

**Purpose.** In code-first GraphQL a field exists in the schema only because it is declared with
`@Field()` on the `@ObjectType`. A `@ResolveField` supplies the field's **value**; it does not
declare the field. So every exposed field is declared once with `@Field()`, and how its value is
produced depends on the field:

- **Plain field** — the value is on the object. Declare `@Field()`, populate it, add **no**
  `@ResolveField`.
- **Computed / resolved field** — declare `@Field()` on the class as type-only (never populated),
  and implement it with exactly one `@ResolveField` in the type's `<type>.resolver.ts`
  (see `resolver-per-type`).

> **The field must be declared on the `@ObjectType` as well.** A `@ResolveField` supplies a
> field's value; it does not declare the field. Every resolved field needs its own `@Field()` line
> on the `@ObjectType` or it will not appear in the schema.

**Responsibilities.**

- Declare each exposed field exactly once, with `@Field()`, on the `@ObjectType`.
- Leave a computed field's class property undeclared in the data (use `!`, e.g.
  `onboardingComplete!: boolean`) and never assign it.
- Give each computed field one `@ResolveField` and nothing else.

**Never.**

- Declare a field with `@ResolveField` but no `@Field` — it will not appear in the schema (Nest
  warns "ResolveField … identified as defined in the resolver but not in the schema").
- Add a `@ResolveField` for a plain field — it is redundant and hides which fields are stored.
- Populate a field on the object *and* resolve it with `@ResolveField` — two sources of truth; the
  resolver silently wins and the stored value is ignored.
- Assign a computed property in a mapper or service as well as resolving it.

**Incorrect (computed field has no declaration, or two sources of truth):**

```typescript
// entities/user-preferences.entity.ts
@ObjectType()
export class UserPreferences {
  @Field() timezone: string;
  @Field() onboardingComplete?: boolean; // ALSO populated from the DB...
}

// resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  @ResolveField(() => Boolean)           // ...and resolved here
  onboardingComplete(@Parent() prefs: UserPreferences) {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
// A field with only @ResolveField and no @Field would not be in the schema at all.
```

Why it is wrong: `onboardingComplete` has two sources (the stored value and the resolver), so the
stored value is ignored; a resolver-only field would never be exposed.

**Correct (declared once; computed resolved in the per-type resolver):**

```typescript
// entities/user-preferences.entity.ts
@ObjectType()
export class UserPreferences {
  @Field() timezone: string;                 // plain: value on the object

  @Field(() => Boolean)
  onboardingComplete!: boolean;              // computed: type-only, never populated
}

// resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @ResolveField(() => Boolean)
  onboardingComplete(@Parent() prefs: UserPreferences): Promise<boolean> {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
```

Why it is right: the schema field is declared exactly once; its value has exactly one source; and
plain fields carry no resolver, so the presence of a resolver marks a computed field.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 4.2 Split Resolvers by Role into resolvers/

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

### 4.3 One Resolver File per Type That Has Field Resolvers

**Impact: HIGH** — the resolver file is the registry of a type's resolved fields

**Purpose.** Some fields on an `@ObjectType` cannot be read from the stored object — a nested value
object's computed fields (`UserPreferences.darkMode`), or a field derived elsewhere. Each needs an
`@ResolveField`. GraphQL never records which fields have resolvers, so the code must: a type that
has any field resolver gets **one** resolver file, and that file contains all of them. The file's
presence is the signal that the type has resolved fields; a type with no such file has only plain
fields.

**Placement.** `modules/<owner>/resolvers/<type>.resolver.ts`, where `<owner>` is the module that
owns the type and `<type>` is the kebab name of the type being resolved — for example
`users/resolvers/user-preferences.resolver.ts` for the `UserPreferences` type. Class name
`<Type>Resolver`.

**Responsibilities.**

- Declare each resolved field on the `@ObjectType` with `@Field()` **as well as** implementing it
  with `@ResolveField` — the resolver supplies the field's value but does not add it to the
  schema (see `resolver-computed-fields`).
- Declare `@Resolver(() => TheType)` and one `@ResolveField` per resolved field.
- Make the method name equal the GraphQL field name.
- Hold **every** field resolver for that type.

**Never.**

- Split a type's field resolvers across several files.
- Create a resolver file for a type whose fields are all plain (it needs none).
- Put query or mutation resolvers here — those belong to the top-level type's resolver.

**Incorrect (a type's resolved fields are spread out, so which are resolved is unclear):**

```typescript
// users/resolvers/users.query.resolver.ts — one UserPreferences field resolver buried with queries
@Resolver(() => UserPreferences)
export class UsersQueryResolver {
  @ResolveField(() => String)
  greeting(@Parent() prefs: UserPreferences) { /* ... */ }
}
// users/resolvers/user-preferences.extra.resolver.ts — another UserPreferences resolver elsewhere
// Result: nothing tells a reader which UserPreferences fields are resolved.
```

Why it is wrong: to learn which fields of `UserPreferences` have custom resolvers you must search
the whole module.

**Correct (one registry file for the type):**

```typescript
// users/resolvers/user-preferences.resolver.ts
@Resolver(() => UserPreferences)
export class UserPreferencesResolver {
  constructor(private readonly preferencesService: UserPreferencesService) {}

  @ResolveField(() => String)
  greeting(@Parent() prefs: UserPreferences): string {
    return this.preferencesService.greeting(prefs.locale);
  }

  @ResolveField(() => Boolean)
  onboardingComplete(@Parent() prefs: UserPreferences): Promise<boolean> {
    return this.preferencesService.isOnboardingComplete(prefs.userId);
  }
}
```

Why it is right: every `@ResolveField` for `UserPreferences` lives in one file; its existence says
the type has resolved fields, and opening it lists exactly which.

This is a same-module ("nested") resolver. When a field is backed by data another module owns, the
file lives in that module instead — see `relations-owning-module`. The module a resolver lives in
is what distinguishes a nested field from a cross-module relation.

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

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-repository-pattern`.

---

## 7. Relations & Cross-Module

**Section Impact: CRITICAL**

### 7.1 Resolve Circular Module Dependencies

**Impact: CRITICAL** — a cycle is an architecture bug, not a wiring problem

**Purpose.** A circular dependency is when module A imports module B and B imports A, directly
or transitively. It is an architecture problem: the two modules are really one, or the shared
piece belongs in a third module. Fix the structure first; `forwardRef` is a last resort that
hides the cycle rather than removing it. Relation fields rarely cause cycles, because the module
that owns the data owns the field (see `relations-owning-module`).

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

**Behavioral depth.** See `nestjs-best-practices` -> `arch-avoid-circular-deps`.

---

### 7.2 Batch Relations with a Per-Request DataLoader

**Impact: CRITICAL** — eliminates N+1 on relational fields

**Purpose.** A field resolver runs once per parent, so a naive implementation issues one query
per parent — the N+1 problem. A `DataLoader` batches those per-parent loads within a single
tick into one query and memoizes them for the request. Loaders live in the feature's `loaders/`
folder, are created per request, and are exposed through the GraphQL context.

**Placement.** `modules/<feature>/loaders/<feature>.loader.ts`, provided request-scoped by the
module that declares the field — the module that owns the data — and injected into the field
resolvers that use it; it batches that module's own service.

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

**Correct (request-scoped loader provider, injected where used):**

```typescript
// loaders/orders.loader.ts — one instance per request
@Injectable({ scope: Scope.REQUEST })
export class OrdersLoader {
  constructor(private readonly ordersService: OrdersService) {}

  // The batch function itself — group keys, return results in input-key order —
  // is a performance concern covered by nestjs-best-practices -> db-avoid-n-plus-one.
  private readonly byUser = new DataLoader<string, Order[]>((userIds) =>
    this.ordersService.findByUserIds([...userIds]),
  );

  loadByUserId(id: string): Promise<Order[]> {
    return this.byUser.load(id);
  }
}
```

Why it is right: the loader lives in `loaders/`, is request-scoped so its cache never crosses
requests, and is injected into the field resolver that needs it. The batching/grouping
implementation itself is owned by `db-avoid-n-plus-one`.

Reference: [graphql/dataloader](https://github.com/graphql/dataloader)

**Behavioral depth.** See `nestjs-best-practices` -> `db-avoid-n-plus-one` for the batch function itself.

---

### 7.3 Decouple Modules with Events

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
exported service instead (see `module-export-policy`).

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-events`.

---

### 7.4 Resolve Relations with @ResolveField

**Impact: CRITICAL** — resolve relations on demand, not eagerly

**Purpose.** A relation exposed on a type — a field pointing to other objects — is resolved with
an `@ResolveField` method, on demand, only when the client requests it. Never eager-load relations
in the parent query. This rule covers the mechanic; when the relation's data lives in another
module, *who declares the field* is decided by `relations-owning-module`.

**Placement.** `modules/<owner>/resolvers/<type>-<feature>.resolver.ts` — the resolver lives with
the module that owns the data the field returns. The method name matches the GraphQL field.

**Responsibilities.**

- Declare `@Resolver(() => OwnerType)` for the type the fields belong to.
- Read the parent key with `@Parent()`.
- Delegate to the owning module's own service or loader (see `relations-dataloader`).

**Never.**

- Eager-load relations in the query resolver.
- Query once per parent inside the field resolver (that is N+1 — see `relations-dataloader`).
- Reach into another module's repository, entity, or model.

**Incorrect (relations eager-loaded in the parent query):**

```typescript
// orders/resolvers/orders.query.resolver.ts
@Query(() => Order)
async order(@Args('id') id: string) {
  return this.orderModel.findById(id).populate(['items', 'items.product']); // loads all, asked or not
}
```

Why it is wrong: the query does work the client did not request and pays for it on every call.

**Correct (same-module relation resolved on demand and batched):**

```typescript
// orders/resolvers/orders.field.resolver.ts — both Order and OrderItem are owned by OrdersModule
@Resolver(() => Order)
export class OrdersFieldResolver {
  constructor(private readonly orderItemsLoader: OrderItemsLoader) {}

  @ResolveField(() => [OrderItem])
  items(@Parent() order: Order): Promise<OrderItem[]> {
    return this.orderItemsLoader.loadByOrderId(order.id);
  }
}
```

Why it is right: the field is resolved only when asked, from the parent already in hand, by the
module that owns order items.

For a relation whose data lives in **another** module, the same mechanic is declared in that
module's own resolver — see `relations-owning-module`. For nested/computed fields on a sub-type of
this module's own graph, keep them in one file per type — see `resolver-per-type`.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

**Behavioral depth.** See `nestjs-best-practices` -> `db-avoid-n-plus-one`.

---

### 7.5 Put a Relation Field in the Module That Owns Its Data

**Impact: CRITICAL** — one-directional module dependencies; no forwardRef

When a type from module A needs a field whose data comes from module B, the field is **not**
added in A. It is added in **B**, as an extension resolver on A's type (`@Resolver(() => A)` +
`@ResolveField`), using B's own service. B may import A only to reference A's type; A never
imports B. The module that owns the extra data owns the field, so module and service dependencies
stay one-directional and no cycle or `forwardRef` is ever needed — even though the GraphQL types
reference each other in both directions.

**Placement.** `<data-owner>/resolvers/<type>-<feature>.resolver.ts` (for example
`comments/resolvers/user-comments.resolver.ts`).

**MUST.**

- Put the resolver in the module that owns the data the field returns.
- Declare it `@Resolver(() => OtherType)` with a `@ResolveField(() => FieldType)` method.
- Read the parent key from `@Parent()` and call the module's **own** service.
- Keep every dependency pointing data-owner → type-owner.

**MUST NOT.**

- Add the relation field inside the type's own module when that requires importing the module
  that owns the data.
- Import the data-owner module from the type-owner module.
- Reach into another module's repository, entity, or model.
- Use `forwardRef` to make a relation field resolve.

**Decision question.** *I need field X on type T — where does the data come from? Put the
resolver in that module.*

**Good / bad — `User.comments`:**

```typescript
// BAD — the type's own module imports the data owner to resolve User.comments
// users/resolvers/users.field.resolver.ts
@Resolver(() => User)
export class UsersFieldResolver {
  constructor(private readonly commentsService: CommentsService) {} // UsersModule now imports CommentsModule
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user.id);
  }
}
// A cycle appears the moment CommentsModule needs anything from UsersModule.
```

```typescript
// GOOD — the data owner owns the field and extends User
// comments/resolvers/user-comments.resolver.ts
@Resolver(() => User)                                   // A's type, imported as a class
export class UserCommentsResolver {
  constructor(private readonly commentsService: CommentsService) {} // its own service
  @ResolveField(() => [Comment]) comments(@Parent() user: User) {
    return this.commentsService.findByUserId(user.id);
  }
}
// CommentsModule imports UsersModule only to reference User.
// UsersModule knows nothing about comments. Dependencies point one way -> no cycle, no forwardRef.
```

**PR checklist.**

- [ ] The relation field's resolver lives in the module that owns the returned data.
- [ ] The resolver uses that module's own service, not another module's.
- [ ] No type-owner module imports the data-owner module.
- [ ] No `forwardRef` was added to make the field resolve.
- [ ] `@Parent()` supplies the key; the parent is not re-fetched to find it.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers) | [NestJS Circular dependency](https://docs.nestjs.com/fundamentals/circular-dependency)

---

## 8. Config, Common & Infra

**Section Impact: MEDIUM**

### 8.1 Put Shared Building Blocks in common/

**Impact: MEDIUM** — reusable, feature-agnostic helpers live here

**Purpose.** Cross-cutting building blocks that any feature may use — decorators, exception
filters, guards, interceptors, pipes, and custom scalars — live in `common/`. They know nothing
about any feature. Features import them; they never import a feature.

**Placement.** `src/common/{decorators,filters,guards,interceptors,pipes,scalars,utils}/`.

**Responsibilities.**

- Provide feature-agnostic, reusable helpers.
- Expose provider-based helpers through a shared module if they need DI.

**Never.**

- Import a feature module — `common/` sits below features in the dependency direction.
- Hold feature-specific logic; that belongs in the feature.
- Duplicate a helper into each feature; define it once here.

**Incorrect (a cross-cutting decorator copy-pasted per feature):**

```typescript
// modules/users/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(/* ... */);

// modules/orders/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(/* ... */); // the same code again
```

Why it is wrong: the same helper exists in several places and drifts as each copy is edited.

**Correct (one shared decorator in common/):**

```typescript
// common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    GqlExecutionContext.create(context).getContext().req.user,
);

// features import the one definition
import { CurrentUser } from '../../common/decorators/current-user.decorator';
```

Why it is right: defined once, used everywhere, and `common/` has no dependency on any feature.

Reference: [NestJS Custom Decorators](https://docs.nestjs.com/custom-decorators) | [NestJS Guards](https://docs.nestjs.com/guards)

---

### 8.2 Put Typed Configuration in config/

**Impact: MEDIUM** — no process.env scattered through the app

**Purpose.** Configuration lives in `config/` as typed namespaces plus a validation schema.
Modules inject `ConfigService` (or a namespaced config type) instead of reading `process.env`
directly, and validation runs at startup so a missing variable fails fast rather than in
production under load.

**Placement.** `src/config/app.config.ts`, `src/config/database.config.ts`,
`src/config/validation.schema.ts`.

**Responsibilities.**

- Define typed namespaces with `registerAs`.
- Validate required environment variables at startup (Joi or Zod).
- Load once and expose globally.

**Never.**

- Read `process.env` inside services or resolvers.
- Hardcode secrets or defaults at the point of use.
- Parse numbers or booleans ad hoc at each call site.

**Incorrect (scattered, unvalidated environment access):**

```typescript
@Injectable()
export class PaymentsService {
  charge() {
    const key = process.env.STRIPE_KEY;                     // untyped, unvalidated
    const retries = parseInt(process.env.RETRIES ?? '3');   // parsed at every call site
    // ...
  }
}
```

Why it is wrong: configuration has no single source of truth, typos fail silently at runtime,
and a missing variable is discovered only when that code path runs.

**Correct (typed namespaces, validated once, injected):**

```typescript
// config/app.config.ts
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  stripeKey: process.env.STRIPE_KEY,
}));

// config/validation.schema.ts
export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  STRIPE_KEY: Joi.string().required(),
});

// app.module.ts
ConfigModule.forRoot({ isGlobal: true, load: [appConfig], validationSchema });

// services/payments.service.ts
@Injectable()
export class PaymentsService {
  constructor(private readonly config: ConfigService) {}

  charge() {
    const key = this.config.get<string>('app.stripeKey'); // typed, validated at startup
  }
}
```

Why it is right: one typed source of truth, validated once at boot, injected where needed.

Reference: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)

**Behavioral depth.** See `nestjs-best-practices` -> `devops-use-config-module`.

---

### 8.3 Put Database Setup and Migrations in infra/database/

**Impact: MEDIUM** — the connection is configured once

**Purpose.** The database connection and migrations live in `infra/database/`. The module
configures the connection from typed config; migrations live in a subfolder; feature modules
declare only their own collections/entities via `forFeature`.

**Placement.** `src/infra/database/database.module.ts`, `database.providers.ts`, `migrations/`.

**Responsibilities.**

- Configure the connection from `ConfigService` (once).
- Export the connection module for features to import.
- Hold migration files.

**Never.**

- Configure the database in a feature module.
- Dump migrations at the repository root.
- Read database environment variables directly — use `config/`.

**Incorrect (a feature configures the whole database):**

```typescript
// modules/users/users.module.ts
@Module({ imports: [MongooseModule.forRoot(process.env.MONGO_URI)] })
export class UsersModule {}

// migrations/0001-init.ts at the repository root, beside unrelated folders
```

Why it is wrong: an arbitrary feature owns the connection, and migrations have no home.

**Correct (one infrastructure module, features register only their own schema):**

```typescript
// infra/database/database.module.ts
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('database.uri') }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}

// a feature declares only its own collection
@Module({ imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])] })
export class UsersModule {}
```

Why it is right: the connection is configured once from typed config, and each feature registers
only the collections it owns.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)

**Behavioral depth.** See `nestjs-best-practices` -> `db-use-migrations`.

---

### 8.4 Put GraphQL Setup in infra/graphql/

**Impact: MEDIUM** — one place configures the server and its context

**Purpose.** The `GraphQLModule` configuration and the per-request context factory live in
`infra/graphql/`. The module configures the driver, schema generation, and global options; the
context file builds the object every request sees — the request, the authenticated user, and
the per-request DataLoaders.

**Placement.** `src/infra/graphql/graphql.module.ts`, `src/infra/graphql/graphql.context.ts`.

**Responsibilities.**

- Configure `GraphQLModule.forRootAsync` (driver, `autoSchemaFile`, global options).
- Build the request context: `req` and the authenticated `user`.
- Register global field middleware or custom scalars if needed.

**Never.**

- Scatter `GraphQLModule.forRoot` across feature modules.
- Build the context ad hoc inside resolvers.
- Hold request-scoped state as a singleton. DataLoaders are request-scoped providers injected
  where used (see `relations-dataloader`), never application singletons.

**Incorrect (context assembled per resolver, loader lifetime uncontrolled):**

```typescript
@Query(() => [Order])
async orders(@Context() ctx: any) {
  ctx.ordersLoader ??= new OrdersLoader(); // shared across requests, cache leaks
  return ctx.ordersLoader.loadByUserId('...');
}
```

Why it is wrong: the loader's lifetime is uncontrolled and GraphQL configuration has no single
home.

**Correct (config in the module, per-request context in one file):**

```typescript
// infra/graphql/graphql.module.ts
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
        sortSchema: true,
        context: ({ req }: { req: Request }) => buildContext(req),
      }),
    }),
  ],
})
export class GraphqlInfraModule {}

// infra/graphql/graphql.context.ts
export function buildContext(req: Request) {
  return { req, user: req.user }; // request-scoped providers (e.g. loaders) are injected where used
}
```

Why it is right: the GraphQL server is configured once and every request gets its own context
object; request-scoped providers such as DataLoaders are injected where they are used, so no
cache leaks between requests.

Reference: [NestJS GraphQL Quick Start](https://docs.nestjs.com/graphql/quick-start)

---

## 9. Conventions & Testing

**Section Impact: MEDIUM**

### 9.1 Use the Nest CLI Generator, Then Adjust

**Impact: MEDIUM** — scaffold with the generator, then place files per this skill

**Purpose.** Use `nest g` to scaffold boilerplate, then move and adjust the generated files to
the canonical structure. The generator wires providers and imports for you; this skill decides
the final layout. Enable the GraphQL CLI plugin so the generator and compiler infer `@Field`
types.

**Placement.** Run from the project root; adjust the generated files into `modules/<feature>/`.

**Responsibilities.**

- Scaffold with `nest g resource <feature>` (GraphQL transport) or
  `nest g module|service|resolver`.
- Move generated files into the canonical subfolders.
- Enable the `@nestjs/graphql` plugin in `nest-cli.json`.

**Never.**

- Hand-write boilerplate the generator produces.
- Leave generated files in a default layout that differs from this skill.
- Ship a `nest-cli.json` without the GraphQL plugin in a code-first GraphQL app.

**Incorrect (no plugin, flat default layout):**

```json
// nest-cli.json
{ "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

Why it is wrong: without the plugin every `number` and nullable field needs a hand-written type
function, and a generated resource lands flat and then has to be reorganized by hand.

**Correct (plugin enabled, scaffold then place):**

```json
// nest-cli.json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/graphql",
        "options": { "typeFileNameSuffix": [".input.ts", ".model.ts", ".entity.ts"] }
      }
    ]
  }
}
```

```bash
nest g resource users
# then move the generated files into modules/users/{resolvers,services,dto,entities}/ per this skill
```

Why it is right: boilerplate and wiring are generated and type metadata is inferred, while the
final layout still follows this skill.

Reference: [NestJS CRUD Generator](https://docs.nestjs.com/recipes/crud-generator) | [NestJS CLI Plugin](https://docs.nestjs.com/cli/overview)

---

### 9.2 Keep Constants and Enums Out of Class Files

**Impact: MEDIUM** — one home per value; class files contain only their class

**Purpose.** A class file (`*.service.ts`, `*.resolver.ts`, `*.module.ts`, …) should contain its
class and nothing else. Constants, enums, and standalone helper functions declared at the top of
a class file have no home, cannot be reused or tested on their own, and invite copies that drift.
Give each of them its own file.

**Placement.**

- Feature-specific values: `modules/<feature>/constants/<name>.constants.ts` and
  `modules/<feature>/constants/<name>.enum.ts`.
- Cross-cutting values: `common/constants/`.

**Responsibilities.**

- Export named, typed constants and enums from a dedicated file.
- Name them for the concept (`UserStatus`, `MAX_PAGE_SIZE`).

**Never.**

- Declare a `const`, `enum`, or standalone helper at the top of a service, resolver, or module
  file.
- Inline magic literals in methods when a named constant or enum already exists.
- Park "a couple of helpers" in whatever class file first needed them.

**Incorrect (values buried in a class file):**

```typescript
// services/users.service.ts
const MAX_PAGE_SIZE = 100;                              // buried here, reusable nowhere
enum Status { Active = 'active', Banned = 'banned' }    // declared inside a class file

@Injectable()
export class UsersService {
  async findAll(page: number, limit: number) {
    if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;
    // ...
  }
}
```

Why it is wrong: the value and the enum live only in this file; the next feature that needs
`MAX_PAGE_SIZE` copies it, and the two copies drift.

**Correct (dedicated files, imported where needed):**

```typescript
// constants/user.constants.ts
export const MAX_PAGE_SIZE = 100;

// constants/user-status.enum.ts
export enum UserStatus {
  Active = 'active',
  Banned = 'banned',
}

// services/users.service.ts
import { MAX_PAGE_SIZE } from '../constants/user.constants';

@Injectable()
export class UsersService {
  async findAll(page: number, limit: number) {
    return this.usersRepository.findMany({
      page,
      limit: Math.min(limit, MAX_PAGE_SIZE),
    });
  }
}
```

Why it is right: each value has one home and one name, and class files stay about their class.

A GraphQL enum that must be registered code-first also lives in its own file and is registered
once with `registerEnumType` (see the GraphQL enums docs).

Reference: [TypeScript Enums](https://www.typescriptlang.org/docs/handbook/enums.html) | [NestJS GraphQL Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums)

---

### 9.3 File and Class Naming Conventions

**Impact: MEDIUM** — predictable names make placement obvious

**Purpose.** Consistent naming is the cheapest way to keep the structure discoverable. Files are
named by feature and role; the role suffix matches the folder the file lives in; classes are
PascalCase and named after the concept.

**Placement.** Throughout `src/`.

**Responsibilities.**

- Name files `<feature>.<role>.ts` (or `<verb>-<feature>.<role>.ts` for inputs/args).
- Name classes after the concept, in PascalCase, ending with the role.

**Never.**

- Mix roles in one filename.
- Use generic names (`helpers.ts`, `utils.ts`) for feature code.
- Use a different suffix for the same role in different features.

**Incorrect (role unclear, generic, wrong case):**

```text
modules/users/
  usersStuff.ts          # role unclear
  helper.ts              # generic
  UsersQueryResolver.ts  # filename should be lower-case role-based
```

Why it is wrong: the filename does not say what the file is or where it belongs.

**Correct (one pattern per kind):**

| Kind | File pattern | Class |
|------|--------------|-------|
| Feature module | `<feature>.module.ts` | `<Feature>Module` |
| Query resolver | `<feature>.query.resolver.ts` | `<Feature>QueryResolver` |
| Mutation resolver | `<feature>.mutation.resolver.ts` | `<Feature>MutationResolver` |
| Relation field resolver | `<type>-<feature>.resolver.ts` | `<Type><Feature>Resolver` |
| Nested/computed field resolver | `<type>.resolver.ts` | `<Type>Resolver` |
| Service | `<feature>.service.ts` / `<feature>-<concern>.service.ts` | `<Feature>Service` |
| Repository | `<feature>.repository.ts` | `<Feature>Repository` |
| Entity | `<feature>.entity.ts` | `<Feature>` |
| Input | `create-<feature>.input.ts` | `Create<Feature>Input` |
| Args | `find-<feature>.args.ts` | `Find<Feature>Args` |
| Loader | `<feature>.loader.ts` | `<Feature>Loader` |
| Event | `<feature>-<action>.event.ts` | `<Feature><Action>Event` |
| Listener | `<feature>-<action>.listener.ts` | `<Feature><Action>Listener` |
| Unit test | `<name>.spec.ts` | — |
| E2E test | `<feature>.e2e-spec.ts` | — |

Why it is right: the role suffix matches the folder and the class name, so any file can be
located by name alone.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

---

### 9.4 Test File Placement

**Impact: MEDIUM** — tests live next to what they test

**Purpose.** Unit tests are co-located with the code they cover, named `<name>.spec.ts`.
End-to-end tests live in a top-level `test/` folder. Neither lives in a technical `tests/`
layer, and tests follow the same feature-first organization as the code.

**Placement.** Unit: beside the subject, for example
`modules/<feature>/services/<feature>.service.spec.ts`. E2E: `test/<feature>.e2e-spec.ts`.

**Responsibilities.**

- Keep unit tests beside their subject.
- Keep e2e tests in `test/`.
- Mirror the feature structure in test names.

**Never.**

- Put unit tests in a separate top-level layer.
- Mix e2e specs among unit specs.
- Let the test layout diverge from the source layout.

**Incorrect (parallel technical layer, e2e mixed with unit):**

```text
src/
└── __tests__/
    ├── usersService.test.ts   # separated from its subject
    └── e2e-users.test.ts      # e2e mixed into the unit folder
```

Why it is wrong: tests are detached from their subjects and the two kinds are mixed, so neither
is easy to find or run.

**Correct (unit co-located, e2e in test/):**

```text
modules/users/services/
├── users.service.ts
└── users.service.spec.ts       # unit, beside its subject
test/
└── users.e2e-spec.ts           # e2e, one home
```

Why it is right: a unit test sits with its subject, and every e2e test has one place.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)

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
