# NestJS Best Practices

**Version 1.3.0**
NestJS Best Practices
October 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

Comprehensive best practices and architecture guide for NestJS applications, designed for AI agents and LLMs. Contains 41 rules across 10 categories, prioritized by impact from critical (architecture, dependency injection) to incremental (DevOps patterns). Each rule includes detailed explanations, real-world examples comparing incorrect vs. correct implementations, and specific impact metrics to guide automated refactoring and code generation.

---

## Table of Contents

1. [Architecture](#1-architecture) — **CRITICAL**
   - 1.1 [Avoid Circular Dependencies](#11-avoid-circular-dependencies)
   - 1.2 [Organize by Feature Modules](#12-organize-by-feature-modules)
   - 1.3 [Use Proper Module Sharing Patterns](#13-use-proper-module-sharing-patterns)
   - 1.4 [Use Schema Evolution for Breaking Changes](#14-use-schema-evolution-for-breaking-changes)
   - 1.5 [Single Responsibility for Services](#15-single-responsibility-for-services)
   - 1.6 [Use Event-Driven Architecture for Decoupling](#16-use-event-driven-architecture-for-decoupling)
   - 1.7 [Use Repository Pattern for Data Access](#17-use-repository-pattern-for-data-access)
2. [Dependency Injection](#2-dependency-injection) — **CRITICAL**
   - 2.1 [Avoid Service Locator Anti-Pattern](#21-avoid-service-locator-anti-pattern)
   - 2.2 [Apply Interface Segregation Principle](#22-apply-interface-segregation-principle)
   - 2.3 [Honor Liskov Substitution Principle](#23-honor-liskov-substitution-principle)
   - 2.4 [Prefer Constructor Injection](#24-prefer-constructor-injection)
   - 2.5 [Understand Provider Scopes](#25-understand-provider-scopes)
   - 2.6 [Use Injection Tokens for Interfaces](#26-use-injection-tokens-for-interfaces)
3. [Error Handling](#3-error-handling) — **HIGH**
   - 3.1 [Handle Async Errors Properly](#31-handle-async-errors-properly)
   - 3.2 [Throw Domain Errors from Services](#32-throw-domain-errors-from-services)
   - 3.3 [Use Exception Filters for Error Handling](#33-use-exception-filters-for-error-handling)
4. [Security](#4-security) — **HIGH**
   - 4.1 [Implement Secure JWT Authentication](#41-implement-secure-jwt-authentication)
   - 4.2 [Implement Rate Limiting](#42-implement-rate-limiting)
   - 4.3 [Sanitize Output to Prevent XSS](#43-sanitize-output-to-prevent-xss)
   - 4.4 [Use Guards for Authentication and Authorization](#44-use-guards-for-authentication-and-authorization)
   - 4.5 [Validate All Input with Input Types and Pipes](#45-validate-all-input-with-input-types-and-pipes)
5. [Performance](#5-performance) — **HIGH**
   - 5.1 [Use Async Lifecycle Hooks Correctly](#51-use-async-lifecycle-hooks-correctly)
   - 5.2 [Use Lazy Loading for Large Modules](#52-use-lazy-loading-for-large-modules)
   - 5.3 [Optimize Database Queries](#53-optimize-database-queries)
   - 5.4 [Use Caching Strategically](#54-use-caching-strategically)
6. [Testing](#6-testing) — **MEDIUM-HIGH**
   - 6.1 [Use Supertest for E2E Testing](#61-use-supertest-for-e2e-testing)
   - 6.2 [Mock External Services in Tests](#62-mock-external-services-in-tests)
   - 6.3 [Use Testing Module for Unit Tests](#63-use-testing-module-for-unit-tests)
7. [Database & ORM](#7-database--orm) — **MEDIUM-HIGH**
   - 7.1 [Avoid N+1 Query Problems](#71-avoid-n1-query-problems)
   - 7.2 [Use Database Migrations](#72-use-database-migrations)
   - 7.3 [Use Transactions for Multi-Step Operations](#73-use-transactions-for-multi-step-operations)
8. [Cross-Cutting Concerns](#8-cross-cutting-concerns) — **MEDIUM**
   - 8.1 [Use Interceptors for Cross-Cutting Concerns](#81-use-interceptors-for-cross-cutting-concerns)
   - 8.2 [Use Pipes for Input Transformation](#82-use-pipes-for-input-transformation)
   - 8.3 [Control Response Exposure with GraphQL Types](#83-control-response-exposure-with-graphql-types)
9. [Microservices](#9-microservices) — **MEDIUM**
   - 9.1 [Use Message and Event Patterns Correctly](#91-use-message-and-event-patterns-correctly)
   - 9.2 [Use Message Queues for Background Jobs](#92-use-message-queues-for-background-jobs)
10. [DevOps & Deployment](#10-devops--deployment) — **LOW-MEDIUM**
   - 10.1 [Implement Graceful Shutdown](#101-implement-graceful-shutdown)
   - 10.2 [Keep a .env.example in Sync with Configuration](#102-keep-a-envexample-in-sync-with-configuration)
   - 10.3 [Use ConfigModule for Environment Configuration](#103-use-configmodule-for-environment-configuration)
   - 10.4 [Implement Health Checks](#104-implement-health-checks)
   - 10.5 [Use Structured Logging](#105-use-structured-logging)

---

## 1. Architecture

**Section Impact: CRITICAL**

### 1.1 Avoid Circular Dependencies

**Impact: CRITICAL** — #1 cause of runtime crashes

Circular dependencies occur when Module A imports Module B, and Module B imports Module A (directly or transitively). NestJS can sometimes resolve these through forward references, but they indicate architectural problems and should be avoided. This is the #1 cause of runtime crashes in NestJS applications.

**Incorrect (circular module imports):**

```typescript
// users.module.ts
@Module({
  imports: [OrdersModule], // Orders needs Users, Users needs Orders = circular
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

// orders.module.ts
@Module({
  imports: [UsersModule], // Circular dependency!
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
```

**Correct (extract shared logic or use events):**

```typescript
// Option 1: Extract shared logic to a third module
// shared.module.ts
@Module({
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

// users.module.ts
@Module({
  imports: [SharedModule],
  providers: [UsersService],
})
export class UsersModule {}

// orders.module.ts
@Module({
  imports: [SharedModule],
  providers: [OrdersService],
})
export class OrdersModule {}

// Option 2: Use events for decoupled communication
// users.service.ts
@Injectable()
export class UsersService {
  constructor(private eventEmitter: EventEmitter2) {}

  async createUser(input: CreateUserInput) {
    const user = await this.userRepo.save(input);
    this.eventEmitter.emit('user.created', user);
    return user;
  }
}

// orders.service.ts
@Injectable()
export class OrdersService {
  @OnEvent('user.created')
  handleUserCreated(user: User) {
    // React to user creation without direct dependency
  }
}
```

Reference: [NestJS Circular Dependency](https://docs.nestjs.com/fundamentals/circular-dependency)

---

### 1.2 Organize by Feature Modules

**Impact: CRITICAL** — 3-5x faster onboarding and development

Organize your application into feature modules that encapsulate related functionality. Each feature module should be self-contained with its own resolvers, services, repositories, entities, inputs, and args. Avoid organizing by technical layer (all resolvers together, all services together). This enables 3-5x faster onboarding and feature development. A feature that grows is decomposed into nested modules rather than becoming one large module (see `struct-feature-decomposition` in `nestjs-graphql-structure`).

**Incorrect (technical layer organization):**

```typescript
// Technical layer organization (anti-pattern)
src/
├── resolvers/
│   ├── users.resolver.ts
│   ├── orders.resolver.ts
│   └── products.resolver.ts
├── services/
│   ├── users.service.ts
│   ├── orders.service.ts
│   └── products.service.ts
├── entities/
│   ├── user.entity.ts
│   ├── order.entity.ts
│   └── product.entity.ts
└── app.module.ts  // Imports everything directly
```

**Correct (feature module organization):**

```typescript
// Feature module organization — a feature-first layout
// The full annotated map is owned by nestjs-graphql-structure -> struct-canonical-layout;
// this is a compact representative example.
src/
├── main.ts
├── app.module.ts                        // composition root: imports modules, no logic
├── common/                              // feature-agnostic building blocks
├── infra/                               // one-time infrastructure
├── modules/
│   └── users/                           // one folder per bounded context
│       ├── resolvers/                   // users.query.resolver.ts, users.mutation.resolver.ts
│       ├── services/                    // users.service.ts
│       ├── repositories/                // users.repository.ts
│       ├── dto/                         // create-user.input.ts, find-users.args.ts
│       ├── entities/                    // user.entity.ts
│       └── users.module.ts
└── test/
    └── users.e2e-spec.ts

// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UsersQueryResolver, UsersMutationResolver, UsersService, UsersRepository],
  exports: [UsersService], // Only export the feature's public API
})
export class UsersModule {}

// app.module.ts — the composition root lists modules, not providers
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,        // infra/database — connection configured once
    GraphqlInfraModule,    // infra/graphql — GraphQLModule + context
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
```

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

---

### 1.3 Use Proper Module Sharing Patterns

**Impact: CRITICAL** — Prevents duplicate instances, memory leaks, and state inconsistency

NestJS modules are singletons by default. When a service is properly exported from a module and that module is imported elsewhere, the same instance is shared. However, providing a service in multiple modules creates separate instances, leading to memory waste, state inconsistency, and confusing behavior. Always encapsulate services in dedicated modules, export them explicitly, and import the module where needed.

**Incorrect (service provided in multiple modules):**

```typescript
// StorageService provided directly in multiple modules - WRONG
// common/services/storage.service.ts
@Injectable()
export class StorageService {
  private cache = new Map(); // Each instance has separate state!

  store(key: string, value: any) {
    this.cache.set(key, value);
  }
}

// modules/videos/videos.module.ts
@Module({
  providers: [StorageService], // Instance #1
})
export class VideosModule {}

// modules/channels/channels.module.ts
@Module({
  providers: [StorageService], // Instance #2 - different from VideosModule!
})
export class ChannelsModule {}

// Problems:
// 1. Two separate StorageService instances exist
// 2. cache.set() in ChannelsModule doesn't affect VideosModule's cache
// 3. Memory wasted on duplicate instances
// 4. Debugging nightmares when state doesn't sync
```

**Correct (dedicated shared module with exports):**

```typescript
// common/shared.module.ts
@Module({
  providers: [StorageService],
  exports: [StorageService], // Make available to importers
})
export class SharedModule {}

// modules/videos/videos.module.ts
@Module({
  imports: [SharedModule], // Import the module, not the service
  providers: [VideosService],
})
export class VideosModule {}

// modules/channels/channels.module.ts
@Module({
  imports: [SharedModule], // Same instance shared
  providers: [ChannelsService],
})
export class ChannelsModule {}

// app.module.ts
@Module({
  imports: [
    SharedModule, // Only if AppModule itself needs StorageService
    VideosModule,
    ChannelsModule,
  ],
})
export class AppModule {}

// Now all modules share the SAME StorageService instance
```

**When to use @Global() (sparingly):**

```typescript
// ONLY for truly cross-cutting concerns
@Global()
@Module({
  providers: [LoggerService, HashingService],
  exports: [LoggerService, HashingService],
})
export class SharedModule {}

// Import once in AppModule
@Module({
  imports: [SharedModule], // Registered globally, available everywhere
})
export class AppModule {}

// Other modules don't need to import SharedModule
@Module({
  providers: [UsersService], // Can inject LoggerService without importing
})
export class UsersModule {}

// WARNING: Don't make everything global!
// - Hides dependencies (can't see what a module needs from imports)
// - Makes testing harder
// - Reserve for: config, logging, and other genuinely app-wide providers
```

**Re-exporting shared providers:**

```typescript
// common/shared.module.ts - shared utilities
@Module({
  providers: [DateService, ValidationService],
  exports: [DateService, ValidationService],
})
export class SharedModule {}

// common/building-blocks.module.ts - re-exports shared providers for convenience
@Module({
  imports: [SharedModule],
  exports: [SharedModule], // Re-export for consumers
})
export class BuildingBlocksModule {}

// a feature imports BuildingBlocksModule and gets every shared provider
@Module({
  imports: [BuildingBlocksModule],
  providers: [FeatureService],
})
export class FeatureModule {}
```

Infrastructure is **not** shared through this module. The database connection, `GraphQLModule`, and config registration are one-time infrastructure imported by the composition root from `infra/` — they are never re-exported by `SharedModule`.

Reference: [NestJS Modules](https://docs.nestjs.com/modules#shared-modules)

---

### 1.4 Use Schema Evolution for Breaking Changes

**Impact: MEDIUM** — Schema evolution allows you to evolve your GraphQL API without breaking existing clients

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

---

### 1.5 Single Responsibility for Services

**Impact: CRITICAL** — 40%+ improvement in testability

Each service should have a single, well-defined responsibility. Avoid "god services" that handle multiple unrelated concerns. If a service name includes "And" or handles more than one domain concept, it likely violates single responsibility. This reduces complexity and improves testability by 40%+.

**Incorrect (god service anti-pattern):**

```typescript
// God service anti-pattern
@Injectable()
export class UserAndOrderService {
  constructor(
    private userRepo: UserRepository,
    private orderRepo: OrderRepository,
    private mailer: MailService,
    private payment: PaymentService,
  ) {}

  async createUser(input: CreateUserInput) {
    const user = await this.userRepo.save(input);
    await this.mailer.sendWelcome(user);
    return user;
  }

  async createOrder(userId: string, input: CreateOrderInput) {
    const order = await this.orderRepo.save({ userId, ...input });
    await this.payment.charge(order);
    await this.mailer.sendOrderConfirmation(order);
    return order;
  }

  async calculateOrderStats(userId: string) {
    // Stats logic mixed in
  }

  async validatePayment(orderId: string) {
    // Payment logic mixed in
  }
}
```

**Correct (focused services with single responsibility):**

```typescript
// Focused services with single responsibility
@Injectable()
export class UsersService {
  constructor(private userRepo: UserRepository) {}

  async create(input: CreateUserInput): Promise<User> {
    return this.userRepo.save(input);
  }

  async findById(id: string): Promise<User> {
    return this.userRepo.findOneOrFail({ where: { id } });
  }
}

@Injectable()
export class OrdersService {
  constructor(private orderRepo: OrderRepository) {}

  async create(userId: string, input: CreateOrderInput): Promise<Order> {
    return this.orderRepo.save({ userId, ...input });
  }

  async findByUser(userId: string): Promise<Order[]> {
    return this.orderRepo.find({ where: { userId } });
  }
}

@Injectable()
export class OrderStatsService {
  constructor(private orderRepo: OrderRepository) {}

  async calculateForUser(userId: string): Promise<OrderStats> {
    // Focused stats calculation
  }
}

// Orchestration in a thin resolver or a dedicated orchestrator
@Resolver(() => Order)
export class OrdersMutationResolver {
  constructor(
    private readonly orders: OrdersService,
    private readonly payment: PaymentService,
    private readonly notifications: NotificationService,
  ) {}

  @Mutation(() => Order)
  async createOrder(
    @Args('input') input: CreateOrderInput,
    @CurrentUser() user: User,
  ): Promise<Order> {
    const order = await this.orders.create(user.id, input);
    await this.payment.charge(order);
    await this.notifications.sendOrderConfirmation(order);
    return order;
  }
}
```

Reference: [NestJS Providers](https://docs.nestjs.com/providers)

---

### 1.6 Use Event-Driven Architecture for Decoupling

**Impact: MEDIUM-HIGH** — Enables async processing and modularity

Use `@nestjs/event-emitter` for intra-service events and message brokers for inter-service communication. Events allow modules to react to changes without direct dependencies, improving modularity and enabling async processing.

**Incorrect (direct service coupling):**

```typescript
// Direct service coupling
@Injectable()
export class OrdersService {
  constructor(
    private inventoryService: InventoryService,
    private emailService: EmailService,
    private analyticsService: AnalyticsService,
    private notificationService: NotificationService,
    private loyaltyService: LoyaltyService,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const order = await this.repo.save(input);

    // Tight coupling - OrdersService knows about all consumers
    await this.inventoryService.reserve(order.items);
    await this.emailService.sendConfirmation(order);
    await this.analyticsService.track('order_created', order);
    await this.notificationService.push(order.userId, 'Order placed');
    await this.loyaltyService.addPoints(order.userId, order.total);

    // Adding new behavior requires modifying this service
    return order;
  }
}
```

**Correct (event-driven decoupling):**

```typescript
// Use EventEmitter for decoupling
import { EventEmitter2 } from '@nestjs/event-emitter';

// Define event
export class OrderCreatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly items: OrderItem[],
    public readonly total: number,
  ) {}
}

// Service emits events
@Injectable()
export class OrdersService {
  constructor(
    private eventEmitter: EventEmitter2,
    private repo: Repository<Order>,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const order = await this.repo.save(input);

    // Emit event - no knowledge of consumers
    this.eventEmitter.emit(
      'order.created',
      new OrderCreatedEvent(order.id, order.userId, order.items, order.total),
    );

    return order;
  }
}

// Listeners in separate modules
@Injectable()
export class InventoryListener {
  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.inventoryService.reserve(event.items);
  }
}

@Injectable()
export class EmailListener {
  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.emailService.sendConfirmation(event.orderId);
  }
}

@Injectable()
export class AnalyticsListener {
  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.analyticsService.track('order_created', {
      orderId: event.orderId,
      total: event.total,
    });
  }
}
```

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)

---

### 1.7 Use Repository Pattern for Data Access

**Impact: HIGH** — Decouples business logic from database

Create custom repositories to encapsulate complex queries and database logic. This keeps services focused on business logic, makes testing easier with mock repositories, and allows changing database implementations without affecting business code.

The examples below use TypeORM's `Repository`. If your project uses Mongoose (see `db-avoid-n-plus-one` and the data rules in `nestjs-graphql-structure`), the custom repository wraps the injected model instead (`data-repository` in that skill).

**Incorrect (complex queries in services):**

```typescript
// Complex queries in services
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
  ) {}

  async findActiveWithOrders(minOrders: number): Promise<User[]> {
    // Complex query logic mixed with business logic
    return this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'order')
      .where('user.isActive = :active', { active: true })
      .andWhere('user.deletedAt IS NULL')
      .groupBy('user.id')
      .having('COUNT(order.id) >= :min', { min: minOrders })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  // Service becomes bloated with query logic
}
```

**Correct (custom repository with encapsulated queries):**

```typescript
// Custom repository with encapsulated queries
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findActiveWithMinOrders(minOrders: number): Promise<User[]> {
    return this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'order')
      .where('user.isActive = :active', { active: true })
      .andWhere('user.deletedAt IS NULL')
      .groupBy('user.id')
      .having('COUNT(order.id) >= :min', { min: minOrders })
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async save(user: User): Promise<User> {
    return this.repo.save(user);
  }
}

// Clean service with business logic only
@Injectable()
export class UsersService {
  constructor(private usersRepo: UsersRepository) {}

  async getActiveUsersWithOrders(): Promise<User[]> {
    return this.usersRepo.findActiveWithMinOrders(1);
  }

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.usersRepo.findByEmail(input.email);
    if (existing) {
      // Domain exception, mapped to a GraphQL error by the global filter
      // (see error-use-exception-filters).
      throw new EmailAlreadyRegisteredException(input.email);
    }

    const user = new User();
    user.email = input.email;
    user.name = input.name;
    return this.usersRepo.save(user);
  }
}
```

Reference: [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)

---

## 2. Dependency Injection

**Section Impact: CRITICAL**

### 2.1 Avoid Service Locator Anti-Pattern

**Impact: HIGH** — Hides dependencies and breaks testability

Avoid using `ModuleRef.get()` or global containers to resolve dependencies at runtime. This hides dependencies, makes code harder to test, and breaks the benefits of dependency injection. Use constructor injection instead.

**Incorrect (service locator anti-pattern):**

```typescript
// Use ModuleRef to get dependencies dynamically
@Injectable()
export class OrdersService {
  constructor(private moduleRef: ModuleRef) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    // Dependencies are hidden - not visible in constructor
    const usersService = this.moduleRef.get(UsersService);
    const inventoryService = this.moduleRef.get(InventoryService);
    const paymentService = this.moduleRef.get(PaymentService);

    const user = await usersService.findOne(input.userId);
    // ... rest of logic
  }
}

// Global singleton container
class ServiceContainer {
  private static instance: ServiceContainer;
  private services = new Map<string, any>();

  static getInstance(): ServiceContainer {
    if (!this.instance) {
      this.instance = new ServiceContainer();
    }
    return this.instance;
  }

  get<T>(key: string): T {
    return this.services.get(key);
  }
}
```

**Correct (constructor injection with explicit dependencies):**

```typescript
// Use constructor injection - dependencies are explicit
@Injectable()
export class OrdersService {
  constructor(
    private usersService: UsersService,
    private inventoryService: InventoryService,
    private paymentService: PaymentService,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const user = await this.usersService.findOne(input.userId);
    const inventory = await this.inventoryService.check(input.items);
    // Dependencies are clear and testable
  }
}

// Easy to test with mocks
describe('OrdersService', () => {
  let service: OrdersService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: PaymentService, useValue: mockPaymentService },
      ],
    }).compile();

    service = module.get(OrdersService);
  });
});

// VALID: Factory pattern for dynamic instantiation
@Injectable()
export class HandlerFactory {
  constructor(private moduleRef: ModuleRef) {}

  getHandler(type: string): Handler {
    switch (type) {
      case 'email':
        return this.moduleRef.get(EmailHandler);
      case 'sms':
        return this.moduleRef.get(SmsHandler);
      default:
        return this.moduleRef.get(DefaultHandler);
    }
  }
}
```

Reference: [NestJS Module Reference](https://docs.nestjs.com/fundamentals/module-ref)

---

### 2.2 Apply Interface Segregation Principle

**Impact: HIGH** — Reduces coupling and improves testability by 30-50%

Clients should not be forced to depend on interfaces they don't use. In NestJS, this means keeping interfaces small and focused on specific capabilities rather than creating "fat" interfaces that bundle unrelated methods. When a service only needs to send emails, it shouldn't depend on an interface that also includes SMS, push notifications, and logging. Split large interfaces into role-based ones.

**Incorrect (fat interface forcing unused dependencies):**

```typescript
// Fat interface - forces all consumers to depend on everything
interface NotificationService {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendSms(phone: string, message: string): Promise<void>;
  sendPush(userId: string, notification: PushPayload): Promise<void>;
  sendSlack(channel: string, message: string): Promise<void>;
  logNotification(type: string, payload: any): Promise<void>;
  getDeliveryStatus(id: string): Promise<DeliveryStatus>;
  retryFailed(id: string): Promise<void>;
  scheduleNotification(input: ScheduleNotificationInput): Promise<string>;
}

// Consumer only needs email, but must mock everything for tests
@Injectable()
export class OrdersService {
  constructor(
    private notifications: NotificationService, // Depends on 8 methods, uses 1
  ) {}

  async confirmOrder(order: Order): Promise<void> {
    await this.notifications.sendEmail(
      order.customer.email,
      'Order Confirmed',
      `Your order ${order.id} has been confirmed.`,
    );
  }
}

// Testing is painful - must mock unused methods
const mockNotificationService = {
  sendEmail: jest.fn(),
  sendSms: jest.fn(),           // Never used, but required
  sendPush: jest.fn(),          // Never used, but required
  sendSlack: jest.fn(),         // Never used, but required
  logNotification: jest.fn(),   // Never used, but required
  getDeliveryStatus: jest.fn(), // Never used, but required
  retryFailed: jest.fn(),       // Never used, but required
  scheduleNotification: jest.fn(), // Never used, but required
};
```

**Correct (segregated interfaces by capability):**

```typescript
// Segregated interfaces - each focused on one capability
interface EmailSender {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
}

interface SmsSender {
  sendSms(phone: string, message: string): Promise<void>;
}

interface PushSender {
  sendPush(userId: string, notification: PushPayload): Promise<void>;
}

interface NotificationLogger {
  logNotification(type: string, payload: any): Promise<void>;
}

interface NotificationScheduler {
  scheduleNotification(input: ScheduleNotificationInput): Promise<string>;
}

// Implementation can implement multiple interfaces
@Injectable()
export class NotificationService implements EmailSender, SmsSender, PushSender {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // Email implementation
  }

  async sendSms(phone: string, message: string): Promise<void> {
    // SMS implementation
  }

  async sendPush(userId: string, notification: PushPayload): Promise<void> {
    // Push implementation
  }
}

// Or separate implementations
@Injectable()
export class SendGridEmailService implements EmailSender {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    // SendGrid-specific implementation
  }
}

// Consumer depends only on what it needs
@Injectable()
export class OrdersService {
  constructor(
    @Inject(EMAIL_SENDER) private emailSender: EmailSender, // Minimal dependency
  ) {}

  async confirmOrder(order: Order): Promise<void> {
    await this.emailSender.sendEmail(
      order.customer.email,
      'Order Confirmed',
      `Your order ${order.id} has been confirmed.`,
    );
  }
}

// Testing is simple - only mock what's used
const mockEmailSender: EmailSender = {
  sendEmail: jest.fn(),
};

// Module registration with tokens
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export const SMS_SENDER = Symbol('SMS_SENDER');

@Module({
  providers: [
    { provide: EMAIL_SENDER, useClass: SendGridEmailService },
    { provide: SMS_SENDER, useClass: TwilioSmsService },
  ],
  exports: [EMAIL_SENDER, SMS_SENDER],
})
export class NotificationModule {}
```

**Combining interfaces when needed:**

```typescript
// Sometimes a consumer legitimately needs multiple capabilities
interface EmailAndSmsSender extends EmailSender, SmsSender {}

// Or use intersection types
type MultiChannelSender = EmailSender & SmsSender & PushSender;

// Consumer that genuinely needs multiple channels
@Injectable()
export class AlertService {
  constructor(
    @Inject(MULTI_CHANNEL_SENDER)
    private sender: EmailSender & SmsSender,
  ) {}

  async sendCriticalAlert(user: User, message: string): Promise<void> {
    await Promise.all([
      this.sender.sendEmail(user.email, 'Critical Alert', message),
      this.sender.sendSms(user.phone, message),
    ]);
  }
}
```

Reference: [Interface Segregation Principle](https://en.wikipedia.org/wiki/Interface_segregation_principle)

---

### 2.3 Honor Liskov Substitution Principle

**Impact: HIGH** — Ensures implementations are truly interchangeable without breaking callers

Subtypes must be substitutable for their base types without altering program correctness. In NestJS with dependency injection, this means any implementation of an interface or abstract class must honor the contract completely. A mock payment service used in tests must behave like a real payment service (return similar shapes, handle errors the same way). Violating LSP causes subtle bugs when swapping implementations.

**Incorrect (implementation violates the contract):**

```typescript
// Base interface with clear contract
interface PaymentGateway {
  /**
   * Charges the specified amount.
   * @returns PaymentResult on success
   * @throws PaymentFailedException on payment failure
   */
  charge(amount: number, currency: string): Promise<PaymentResult>;
}

// Production implementation - follows the contract
@Injectable()
export class StripeService implements PaymentGateway {
  async charge(amount: number, currency: string): Promise<PaymentResult> {
    const response = await this.stripe.charges.create({ amount, currency });
    return { success: true, transactionId: response.id, amount };
  }
}

// Mock that violates LSP - different behavior!
@Injectable()
export class MockPaymentService implements PaymentGateway {
  async charge(amount: number, currency: string): Promise<PaymentResult> {
    // VIOLATION 1: Throws for valid input (contract says return PaymentResult)
    if (amount > 1000) {
      throw new Error('Mock does not support large amounts');
    }

    // VIOLATION 2: Returns null instead of PaymentResult
    if (currency !== 'USD') {
      return null as any; // Real service would convert or reject properly
    }

    // VIOLATION 3: Missing required field
    return { success: true } as PaymentResult; // Missing transactionId!
  }
}

// Consumer trusts the contract
@Injectable()
export class OrdersService {
  constructor(@Inject(PAYMENT_GATEWAY) private payment: PaymentGateway) {}

  async checkout(order: Order): Promise<void> {
    const result = await this.payment.charge(order.total, order.currency);
    // These fail with MockPaymentService:
    await this.saveTransaction(result.transactionId); // undefined!
    await this.sendReceipt(result); // might be null!
  }
}
```

**Correct (implementations honor the contract):**

```typescript
// Well-defined interface with documented behavior
interface PaymentGateway {
  /**
   * Charges the specified amount.
   * @param amount - Amount in smallest currency unit (cents)
   * @param currency - ISO 4217 currency code
   * @returns PaymentResult with transactionId, success status, and amount
   * @throws PaymentFailedException if charge is declined
   * @throws InvalidCurrencyException if currency is not supported
   */
  charge(amount: number, currency: string): Promise<PaymentResult>;

  /**
   * Refunds a previous charge.
   * @throws TransactionNotFoundException if transactionId is invalid
   */
  refund(transactionId: string, amount?: number): Promise<RefundResult>;
}

// Production implementation
@Injectable()
export class StripeService implements PaymentGateway {
  async charge(amount: number, currency: string): Promise<PaymentResult> {
    try {
      const response = await this.stripe.charges.create({ amount, currency });
      return {
        success: true,
        transactionId: response.id,
        amount: response.amount,
      };
    } catch (error) {
      if (error.type === 'card_error') {
        throw new PaymentFailedException(error.message);
      }
      throw error;
    }
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    // Implementation...
  }
}

// Mock that honors LSP - same contract, same behavior shape
@Injectable()
export class MockPaymentService implements PaymentGateway {
  private transactions = new Map<string, PaymentResult>();

  async charge(amount: number, currency: string): Promise<PaymentResult> {
    // Honor the contract: validate currency like real service would
    if (!['USD', 'EUR', 'GBP'].includes(currency)) {
      throw new InvalidCurrencyException(`Unsupported currency: ${currency}`);
    }

    // Simulate decline for specific test scenarios
    if (amount === 99999) {
      throw new PaymentFailedException('Card declined (test scenario)');
    }

    // Return same shape as production
    const result: PaymentResult = {
      success: true,
      transactionId: `mock_${Date.now()}_${Math.random().toString(36)}`,
      amount,
    };

    this.transactions.set(result.transactionId, result);
    return result;
  }

  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    // Honor the contract: throw if transaction not found
    if (!this.transactions.has(transactionId)) {
      throw new TransactionNotFoundException(transactionId);
    }

    return {
      success: true,
      refundId: `refund_${transactionId}`,
      amount: amount ?? this.transactions.get(transactionId)!.amount,
    };
  }
}

// Consumer can swap implementations safely
@Injectable()
export class OrdersService {
  constructor(@Inject(PAYMENT_GATEWAY) private payment: PaymentGateway) {}

  async checkout(order: Order): Promise<Order> {
    try {
      const result = await this.payment.charge(order.total, order.currency);
      // Works with both StripeService and MockPaymentService
      order.transactionId = result.transactionId;
      order.status = 'paid';
      return order;
    } catch (error) {
      if (error instanceof PaymentFailedException) {
        order.status = 'payment_failed';
        return order;
      }
      throw error;
    }
  }
}
```

**Testing LSP compliance:**

```typescript
// Shared test suite that any implementation must pass
function testPaymentGatewayContract(
  createGateway: () => PaymentGateway,
) {
  describe('PaymentGateway contract', () => {
    let gateway: PaymentGateway;

    beforeEach(() => {
      gateway = createGateway();
    });

    it('returns PaymentResult with all required fields', async () => {
      const result = await gateway.charge(1000, 'USD');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('transactionId');
      expect(result).toHaveProperty('amount');
      expect(typeof result.transactionId).toBe('string');
    });

    it('throws InvalidCurrencyException for unsupported currency', async () => {
      await expect(gateway.charge(1000, 'INVALID'))
        .rejects.toThrow(InvalidCurrencyException);
    });

    it('throws TransactionNotFoundException for invalid refund', async () => {
      await expect(gateway.refund('nonexistent'))
        .rejects.toThrow(TransactionNotFoundException);
    });
  });
}

// Run against all implementations
describe('StripeService', () => {
  testPaymentGatewayContract(() => new StripeService(mockStripeClient));
});

describe('MockPaymentService', () => {
  testPaymentGatewayContract(() => new MockPaymentService());
});
```

Reference: [Liskov Substitution Principle](https://en.wikipedia.org/wiki/Liskov_substitution_principle)

---

### 2.4 Prefer Constructor Injection

**Impact: CRITICAL** — Required for proper DI and testing

Always use constructor injection over property injection. Constructor injection makes dependencies explicit, enables TypeScript type checking, ensures dependencies are available when the class is instantiated, and improves testability. This is required for proper DI, testing, and TypeScript support.

**Incorrect (property injection with hidden dependencies):**

```typescript
// Property injection - avoid unless necessary
@Injectable()
export class UsersService {
  @Inject()
  private userRepo: UserRepository; // Hidden dependency

  @Inject('CONFIG')
  private config: ConfigType; // Also hidden

  async findAll() {
    return this.userRepo.find();
  }
}

// Problems:
// 1. Dependencies not visible in constructor
// 2. Service can be instantiated without dependencies in tests
// 3. TypeScript can't enforce dependency types at instantiation
```

**Correct (constructor injection with explicit dependencies):**

```typescript
// Constructor injection - explicit and testable
@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    @Inject('CONFIG') private readonly config: ConfigType,
  ) {}

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }
}

// Testing is straightforward
describe('UsersService', () => {
  let service: UsersService;
  let mockRepo: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockRepo = {
      find: jest.fn(),
      save: jest.fn(),
    } as any;

    service = new UsersService(mockRepo, { dbUrl: 'test' });
  });

  it('should find all users', async () => {
    mockRepo.find.mockResolvedValue([{ id: '1', name: 'Test' }]);
    const result = await service.findAll();
    expect(result).toHaveLength(1);
  });
});

// Only use property injection for optional dependencies
@Injectable()
export class LoggingService {
  @Optional()
  @Inject('ANALYTICS')
  private analytics?: AnalyticsService;

  log(message: string) {
    console.log(message);
    this.analytics?.track('log', message); // Optional enhancement
  }
}
```

Reference: [NestJS Providers](https://docs.nestjs.com/providers)

---

### 2.5 Understand Provider Scopes

**Impact: CRITICAL** — Prevents data leaks and performance issues

NestJS has three provider scopes: DEFAULT (singleton), REQUEST (per-request instance), and TRANSIENT (new instance for each injection). Most providers should be singletons. Request-scoped providers have performance implications as they bubble up through the dependency tree. Understanding scopes prevents memory leaks and incorrect data sharing.

**Incorrect (wrong scope usage):**

```typescript
// Request-scoped when not needed (performance hit)
@Injectable({ scope: Scope.REQUEST })
export class UsersService {
  // This creates a new instance for EVERY request
  // All dependencies also become request-scoped
  async findAll() {
    return this.userRepo.find();
  }
}

// Singleton with mutable request state
@Injectable() // Default: singleton
export class RequestContextService {
  private userId: string; // DANGER: Shared across all requests!

  setUser(userId: string) {
    this.userId = userId; // Overwrites for all concurrent requests
  }

  getUser() {
    return this.userId; // Returns wrong user!
  }
}
```

**Correct (appropriate scope for each use case):**

```typescript
// Singleton for stateless services (default, most common)
@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  async findById(id: string): Promise<User> {
    return this.userRepo.findOne({ where: { id } });
  }
}

// Request-scoped ONLY when you need request context
@Injectable({ scope: Scope.REQUEST })
export class RequestContextService {
  private userId: string;

  setUser(userId: string) {
    this.userId = userId;
  }

  getUser(): string {
    return this.userId;
  }
}

// Better: Use NestJS built-in request context
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class AuditService {
  constructor(@Inject(REQUEST) private request: Request) {}

  log(action: string) {
    console.log(`User ${this.request.user?.id} performed ${action}`);
  }
}

// Best: Use ClsModule for async context (no scope bubble-up)
import { ClsService } from 'nestjs-cls';

@Injectable() // Stays singleton!
export class AuditService {
  constructor(private cls: ClsService) {}

  log(action: string) {
    const userId = this.cls.get('userId');
    console.log(`User ${userId} performed ${action}`);
  }
}
```

Reference: [NestJS Injection Scopes](https://docs.nestjs.com/fundamentals/injection-scopes)

---

### 2.6 Use Injection Tokens for Interfaces

**Impact: HIGH** — Enables interface-based DI at runtime

TypeScript interfaces are erased at compile time and can't be used as injection tokens. Use string tokens, symbols, or abstract classes when you want to inject implementations of interfaces. This enables swapping implementations for testing or different environments.

**Incorrect (interface can't be used as token):**

```typescript
// Interface can't be used as injection token
interface PaymentGateway {
  charge(amount: number): Promise<PaymentResult>;
}

@Injectable()
export class StripeService implements PaymentGateway {
  charge(amount: number) { /* ... */ }
}

@Injectable()
export class OrdersService {
  // This WON'T work - PaymentGateway doesn't exist at runtime
  constructor(private payment: PaymentGateway) {}
}
```

**Correct (symbol tokens or abstract classes):**

```typescript
// Option 1: String/Symbol tokens (most flexible)
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export interface PaymentGateway {
  charge(amount: number): Promise<PaymentResult>;
}

@Injectable()
export class StripeService implements PaymentGateway {
  async charge(amount: number): Promise<PaymentResult> {
    // Stripe implementation
  }
}

@Injectable()
export class MockPaymentService implements PaymentGateway {
  async charge(amount: number): Promise<PaymentResult> {
    return { success: true, id: 'mock-id' };
  }
}

// Module registration
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useClass: process.env.NODE_ENV === 'test'
        ? MockPaymentService
        : StripeService,
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentModule {}

// Injection
@Injectable()
export class OrdersService {
  constructor(
    @Inject(PAYMENT_GATEWAY) private payment: PaymentGateway,
  ) {}

  async createOrder(input: CreateOrderInput) {
    await this.payment.charge(input.amount);
  }
}

// Option 2: Abstract class (carries runtime type info)
export abstract class PaymentGateway {
  abstract charge(amount: number): Promise<PaymentResult>;
}

@Injectable()
export class StripeService extends PaymentGateway {
  async charge(amount: number): Promise<PaymentResult> {
    // Implementation
  }
}

// No @Inject needed with abstract class
@Injectable()
export class OrdersService {
  constructor(private payment: PaymentGateway) {}
}
```

Reference: [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)

---

## 3. Error Handling

**Section Impact: HIGH**

### 3.1 Handle Async Errors Properly

**Impact: HIGH** — Prevents process crashes from unhandled rejections

NestJS automatically catches errors from async route handlers, but errors from background tasks, event handlers, and manually created promises can crash your application. Always handle async errors explicitly and use global handlers as a safety net.

**Incorrect (fire-and-forget without error handling):**

```typescript
// Fire-and-forget without error handling
@Injectable()
export class UsersService {
  async createUser(input: CreateUserInput): Promise<User> {
    const user = await this.repo.save(input);

    // Fire and forget - if this fails, error is unhandled!
    this.emailService.sendWelcome(user.email);

    return user;
  }
}

// Unhandled promise in event handler
@Injectable()
export class OrdersService {
  @OnEvent('order.created')
  handleOrderCreated(event: OrderCreatedEvent) {
    // This returns a promise but it's not awaited!
    this.processOrder(event);
    // Errors will crash the process
  }

  private async processOrder(event: OrderCreatedEvent): Promise<void> {
    await this.inventoryService.reserve(event.items);
    await this.notificationService.send(event.userId);
  }
}

// Missing try-catch in scheduled tasks
@Cron('0 0 * * *')
async dailyCleanup(): Promise<void> {
  await this.cleanupService.run();
  // If this throws, no error handling
}
```

**Correct (explicit async error handling):**

```typescript
// Handle fire-and-forget with explicit catch
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  async createUser(input: CreateUserInput): Promise<User> {
    const user = await this.repo.save(input);

    // Explicitly catch and log errors
    this.emailService.sendWelcome(user.email).catch((error) => {
      this.logger.error('Failed to send welcome email', error.stack);
      // Optionally queue for retry
    });

    return user;
  }
}

// Properly handle async event handlers
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      await this.processOrder(event);
    } catch (error) {
      this.logger.error('Failed to process order', { event, error });
      // Don't rethrow - would crash the process
      await this.deadLetterQueue.add('order.created', event);
    }
  }
}

// Safe scheduled tasks
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  @Cron('0 0 * * *')
  async dailyCleanup(): Promise<void> {
    try {
      await this.cleanupService.run();
      this.logger.log('Daily cleanup completed');
    } catch (error) {
      this.logger.error('Daily cleanup failed', error.stack);
      // Alert or retry logic
    }
  }
}

// Global unhandled rejection handler in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  await app.listen(3000);
}
```

Reference: [Node.js Unhandled Rejections](https://nodejs.org/api/process.html#event-unhandledrejection)

---

### 3.2 Throw Domain Errors from Services

**Impact: HIGH** — Keeps resolvers thin and simplifies error handling

Services communicate error states by throwing, which keeps resolvers thin and puts error handling in one place. Throw a typed **domain exception** from the service and let a central exception filter map it to a `GraphQLError` with `extensions`. Each exception is its own file under `exceptions/`, extending the shared `DomainException` — never define an exception class inline in a service, and never build the GraphQL error shape inside the service.

**Incorrect (return error objects instead of throwing):**

```typescript
// Return error objects instead of throwing
@Injectable()
export class UsersService {
  async findById(id: string): Promise<{ user?: User; error?: string }> {
    const user = await this.repo.findById(id);
    if (!user) {
      return { error: 'User not found' }; // Resolver must check this
    }
    return { user };
  }
}
```

**Incorrect (GraphQL error shape built inside the service, exception declared inline):**

```typescript
// The service now knows about GraphQL, and the exception has no home
@Injectable()
export class UsersService {
  async findById(id: string): Promise<User> {
    const user = await this.repo.findById(id);
    if (!user) {
      throw new GraphQLError(`User #${id} not found`, {
        extensions: { code: 'USER_NOT_FOUND' }, // transport detail leaks into business code
      });
    }
    return user;
  }
}

class EntityNotFoundError extends Error {} // declared inline — no file, cannot be reused or filtered
```

**Correct (typed domain exception, one file, mapped by a central filter):**

```typescript
// common/exceptions/domain.exception.ts — the shared base
export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

// modules/users/exceptions/user-not-found.exception.ts — feature-local, one file
export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(`User #${id} not found`, 'USER_NOT_FOUND');
  }
}

// modules/users/services/users.service.ts — imports and throws the domain exception
import { UserNotFoundException } from '../exceptions/user-not-found.exception';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new UserNotFoundException(id);
    }
    return user;
  }

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.usersRepository.findByEmail(input.email);
    if (existing) {
      throw new EmailAlreadyRegisteredException(input.email);
    }
    return this.usersRepository.create(input);
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const user = await this.findById(id); // Throws if not found
    return this.usersRepository.update(id, { ...user, ...input });
  }
}

// Resolver stays thin — no try/catch, no GraphQL error construction
// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User)
  user(@Args() args: FindUserArgs): Promise<User> {
    return this.usersService.findById(args.id);
  }
}
```

**Scope.** This rule governs **services**: they throw typed domain exceptions. Pipes, guards, and middleware sit on the transport edge and may use Nest's built-in HTTP exceptions (`BadRequestException`, `UnauthorizedException`, and the like); the same global filter maps those to a consistent GraphQL error, so they do not need a feature-local `DomainException`.

The mapping from domain exception to GraphQL error happens once, in an exception filter (see `error-use-exception-filters`), so error codes and `extensions` are consistent across the whole API.

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters) | [GraphQL Error Handling](https://graphql.org/learn/serving-over-http/#errors)

---

### 3.3 Use Exception Filters for Error Handling

**Impact: HIGH** — Consistent, centralized error handling

Never catch exceptions and manually format error responses in resolvers. Use NestJS exception filters to handle errors consistently across your application. Create custom exception filters for specific error types and a global filter for unhandled exceptions. In GraphQL, a filter converts a domain exception into a `GraphQLError` with `extensions` — it does not write an HTTP response. Filters live in `common/filters/`.

**Incorrect (manual error handling in resolvers):**

```typescript
// Manual error handling in resolvers
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => User)
  async user(@Args() args: FindUserArgs): Promise<User> {
    try {
      const user = await this.usersService.findById(args.id);
      return user;
    } catch (error) {
      console.error(error);
      // Reformatted by hand in every resolver, inconsistently
      return { message: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' } as User;
    }
  }
}
```

**Correct (exception filters with consistent GraphQL handling):**

```typescript
// A domain exception thrown by the service (one file per exception)
export class UserNotFoundException extends DomainException {
  constructor(userId: string) {
    super(`User with ID "${userId}" not found`, 'USER_NOT_FOUND');
  }
}

// common/filters/domain-exception.filter.ts — maps domain exceptions to GraphQL errors
@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost) {
    // GraphQL-native: rethrow a GraphQLError the schema layers understand
    throw new GraphQLError(exception.message, {
      extensions: {
        code: exception.code,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// common/filters/all-exceptions.filter.ts — global filter for unhandled errors
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger = new Logger('AllExceptionsFilter')) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const message =
      exception instanceof Error
        ? exception.message
        : 'Internal server error';

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    );

    throw new GraphQLError(message, {
      extensions: {
        code: 'INTERNAL_SERVER_ERROR',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Register globally in main.ts — bootstrap wires the global concerns
app.useGlobalFilters(
  new AllExceptionsFilter(),
  new DomainExceptionFilter(),
);
```

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters) | [GraphQL Other Features](https://docs.nestjs.com/graphql/other-features)

---

## 4. Security

**Section Impact: HIGH**

### 4.1 Implement Secure JWT Authentication

**Impact: CRITICAL** — Essential for secure GraphQL APIs

Use `@nestjs/jwt` with `@nestjs/passport` for authentication in GraphQL. Read the token from the GraphQL request (`GqlExecutionContext.create(context).getContext().req`), populate the context's `user`, and use guards on resolvers. Store secrets securely, use appropriate token lifetimes, implement refresh tokens, and validate tokens properly. Never expose sensitive data in JWT payloads.

Auth is its own feature module. Strategies live in `modules/auth/strategies/`, auth services in `modules/auth/services/`, and `AuthModule` depends on `UsersModule` — never the reverse.

**Incorrect (insecure JWT implementation):**

```typescript
// Hardcode secrets
@Module({
  imports: [
    JwtModule.register({
      secret: 'my-secret-key', // Exposed in code
      signOptions: { expiresIn: '7d' }, // Too long
    }),
  ],
})
export class AuthModule {}

// Store sensitive data in JWT
async login(user: User): Promise<{ accessToken: string }> {
  const payload = {
    sub: user.id,
    email: user.email,
    password: user.password, // NEVER include password!
    ssn: user.ssn, // NEVER include sensitive data!
    isAdmin: user.isAdmin,
  };
  return { accessToken: this.jwtService.sign(payload) };
}

// Skip token validation
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: 'my-secret',
    });
  }

  async validate(payload: any): Promise<any> {
    return payload; // No validation of user existence
  }
}
```

**Correct (secure JWT with refresh tokens in GraphQL):**

```typescript
// modules/auth/auth.module.ts — auth depends on users, one way
@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // namespaced, validated config — the `auth` namespace is registered in config/
    // (see devops-use-config-module)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('auth.jwtSecret'),
        signOptions: {
          expiresIn: '15m', // Short-lived access tokens
          issuer: config.get<string>('auth.jwtIssuer'),
          audience: config.get<string>('auth.jwtAudience'),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthMutationResolver],
  exports: [AuthService],
})
export class AuthModule {}

// modules/auth/services/auth.service.ts — minimal JWT payload
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokens: RefreshTokensRepository,
  ) {}

  async login(user: User): Promise<TokenResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(token, 10);

    await this.refreshTokens.save({
      userId,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    return token;
  }
}

// common/guards/jwt-auth.guard.ts — delegates token verification to the JWT strategy below,
// so req.user is the validated User (not the raw token payload)
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Passport runs JwtStrategy; req.user becomes the User returned by validate()
    return super.canActivate(context);
  }
}

// modules/auth/strategies/jwt.strategy.ts — proper JWT strategy with validation
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('auth.jwtSecret'),
      ignoreExpiration: false,
      issuer: config.get<string>('auth.jwtIssuer'),
      audience: config.get<string>('auth.jwtAudience'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findById(payload.sub);

    // user.isActive and user.passwordChangedAt are User entity fields
    // (see nestjs-graphql-structure -> data-entity-mongodb)
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Only check when the entity tracks it and the token carries an issued-at
    if (user.passwordChangedAt && payload.iat) {
      const tokenIssuedAt = new Date(payload.iat * 1000);
      if (tokenIssuedAt < user.passwordChangedAt) {
        throw new UnauthorizedException('Token invalidated by password change');
      }
    }

    return user;
  }
}

// modules/users/resolvers/users.query.resolver.ts — resolver with auth
@Resolver(() => User)
@UseGuards(JwtAuthGuard)
export class UsersQueryResolver {
  @Query(() => User)
  me(@CurrentUser() user: User) {
    return user;
  }

  @Mutation(() => Boolean)
  async updateProfile(
    @Args('input') input: UpdateUserInput,
    @CurrentUser() user: User,
  ) {
    return this.usersService.update(user.id, input);
  }
}

// infra/graphql/graphql.context.ts — the per-request context (see infra-graphql)
export function buildContext(req: Request) {
  // Extract user from JWT and add to context
  return { req, user: req.user };
}
```

Reference: [NestJS Authentication](https://docs.nestjs.com/security/authentication) | [GraphQL Authentication](https://docs.nestjs.com/security/authentication#graphql)

---

### 4.2 Implement Rate Limiting

**Impact: HIGH** — Protects against abuse and ensures fair resource usage

Use `@nestjs/throttler` to limit request rates per resolver. Apply different limits for different resolvers - stricter for auth mutations, more relaxed for read queries. For GraphQL, also consider query complexity analysis to prevent expensive queries. Use Redis for distributed rate limiting in clustered deployments.

**Incorrect (no rate limiting on sensitive resolvers):**

```typescript
// No rate limiting on sensitive resolvers
@Resolver(() => Auth)
export class AuthResolver {
  @Mutation(() => TokenResponse)
  async login(@Args('input') input: LoginInput): Promise<TokenResponse> {
    // Attackers can brute-force credentials
    return this.authService.login(input);
  }

  @Mutation(() => Boolean)
  async forgotPassword(@Args('email') email: string): Promise<boolean> {
    // Can be abused to spam users with emails
    return this.authService.sendResetEmail(email);
  }
}

// Same limits for all resolvers
@UseGuards(ThrottlerGuard)
@Resolver(() => Query)
export class QueryResolver {
  @Query(() => String)
  publicData() {} // Should allow more requests

  @Mutation(() => Payment)
  processPayment() {} // Should be more restrictive
}
```

**Correct (configured throttler with resolver-specific limits):**

```typescript
// Configure throttler globally with multiple limits
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 3, // 3 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 20, // 20 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// Override limits per resolver
@Resolver(() => Auth)
export class AuthResolver {
  @Mutation(() => TokenResponse)
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  async login(@Args('input') input: LoginInput): Promise<TokenResponse> {
    return this.authService.login(input);
  }

  @Mutation(() => Boolean)
  @Throttle({ short: { limit: 3, ttl: 3600000 } }) // 3 per hour
  async forgotPassword(@Args('email') email: string): Promise<boolean> {
    return this.authService.sendResetEmail(email);
  }
}

// Skip throttling for certain resolvers
@Resolver(() => Health)
export class HealthResolver {
  @Query(() => String)
  @SkipThrottle()
  check(): string {
    return 'OK';
  }
}

// Key the throttle per authenticated user instead of per IP
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return req.user?.id || req.ip;
  }
}
// Per-route and per-user limits come from the named throttlers configured above plus
// @Throttle(...) on the resolver — ThrottlerGuard looks them up, so there is no
// per-limit getLimit() override (that was the v4 API, removed in v5).

// Query complexity limiting (GraphQL-native approach)
// A per-field rate limit does not stop one deeply nested, expensive query. Cap that
// separately with a query-complexity plugin/validation rule: the
// `graphql-query-complexity` package exposes a `createComplexityRule` factory that
// walks the parsed query, assigns each field a cost, and rejects the query before it
// executes when the total exceeds your maximum. On Apollo Server v4, register that
// rule as a plugin — the older `buildSchema({ validationRules: [...] })` option was
// removed in Apollo Server v3.

// Rate limiting by query complexity
@Injectable()
export class ComplexityRateLimitGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const info = GqlExecutionContext.create(context).getInfo();
    const complexity = this.calculateComplexity(info);

    if (complexity > 1000) {
      throw new ForbiddenException('Query too complex');
    }

    return true;
  }

  private calculateComplexity(info: any): number {
    // Implement complexity calculation based on query depth and field count
    return info.fieldNodes.reduce((acc: number, node: any) => {
      return acc + this.getFieldComplexity(node);
    }, 0);
  }
}
```

Reference: [NestJS Throttler](https://docs.nestjs.com/security/rate-limiting) | [GraphQL Query Complexity](https://docs.nestjs.com/graphql/other-features)

---

### 4.3 Sanitize Output to Prevent XSS

**Impact: HIGH** — XSS vulnerabilities can compromise user sessions and data

Sanitize user-generated content at the API boundary before you store it. GraphQL responses are JSON, so the GraphQL transport itself is safe — browsers do not execute JSON. The risk is what happens later: the same content is usually rendered by a client or an SSR/REST surface, and reflecting raw input is a classic injection vector. Because the transport is JSON, the fix is to sanitize/encode on store and on render — not to patch the GraphQL layer.

**Incorrect (persisting raw, unsanitized content):**

```typescript
// Raw content from the client is persisted unchanged
@InputType()
export class CreateCommentInput {
  @Field()
  content: string; // may contain <script>steal(document.cookie)</script>

  @Field()
  authorId: string;
}

// modules/comments/resolvers/comments.mutation.resolver.ts
@Resolver(() => Comment)
export class CommentsMutationResolver {
  @Mutation(() => Comment)
  createComment(@Args('input') input: CreateCommentInput): Promise<Comment> {
    // The unsanitized value is stored, so every renderer must now defend itself
    return this.commentsService.create(input);
  }
}
```

**Correct (sanitize content on the input, persist the sanitized value):**

```typescript
// Sanitize via a @Transform on the input, before the value reaches the service
import { Transform } from 'class-transformer';
import * as sanitizeHtml from 'sanitize-html';

const ALLOWED_COMMENT_TAGS = ['p', 'br', 'b', 'i', 'em', 'strong', 'a'];

@InputType()
export class CreateCommentInput {
  @Field()
  @Transform(({ value }) =>
    sanitizeHtml(value, {
      allowedTags: ALLOWED_COMMENT_TAGS,
      allowedAttributes: { a: ['href', 'title'] },
      allowedSchemes: ['http', 'https', 'mailto'],
    }),
  )
  content: string;

  @Field()
  authorId: string;
}

// The sanitized value is what the resolver receives and what gets persisted
@Resolver(() => Comment)
export class CommentsMutationResolver {
  @Mutation(() => Comment)
  createComment(@Args('input') input: CreateCommentInput): Promise<Comment> {
    return this.commentsService.create(input);
  }
}
```

The `@Transform` runs inside the input's transform pipeline, so the resolver and service receive an already-sanitized value and the sanitized value is what is stored — a renderer can still encode on output, but the database never holds raw markup. For values that do not arrive through an input class (a scalar field argument, an uploaded blob), reuse the same allowlist through a small sanitizing pipe instead, so the policy lives in one place (see `use-pipes`). Strip tags entirely (`allowedTags: []`) for fields that should never contain markup, such as a title.

**Note: HTML surfaces only.** A Content-Security-Policy is defence in depth only when the same app also serves an HTML surface (an SSR page, or a REST/HTTP endpoint that returns HTML); it is irrelevant to a pure GraphQL JSON API. When such a surface exists, add it in `main.ts` so a missed sanitization cannot execute inline script:

```typescript
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  await app.listen(3000);
}
```

Reference: [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)

---

### 4.4 Use Guards for Authentication and Authorization

**Impact: HIGH** — Enforces access control before handlers execute

Guards determine whether a request should be handled based on authentication state, roles, permissions, or other conditions. They run after middleware but before pipes and interceptors, making them ideal for access control. Use guards instead of manual checks in resolvers. In GraphQL, guards read the request through `GqlExecutionContext`; shared guards live in `common/guards/`.

**Incorrect (manual auth checks in every handler):**

```typescript
// Manual auth checks in every resolver
@Resolver()
export class AdminResolver {
  @Query(() => [User])
  async users(@Context() ctx: GqlContext) {
    if (!ctx.user) {
      throw new UnauthorizedException();
    }
    if (!ctx.user.roles.includes('admin')) {
      throw new ForbiddenException();
    }
    return this.adminService.getUsers();
  }

  @Mutation(() => Boolean)
  async deleteUser(@Args('id') id: string, @Context() ctx: GqlContext) {
    if (!ctx.user) {
      throw new UnauthorizedException();
    }
    if (!ctx.user.roles.includes('admin')) {
      throw new ForbiddenException();
    }
    return this.adminService.deleteUser(id);
  }
}
```

**Correct (guards with declarative decorators):**

```typescript
// common/guards/jwt-auth.guard.ts — authentication: delegates to the 'jwt' Passport strategy
// (see security-auth-jwt), which sets req.user to the validated user
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check for @Public() decorator
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    return super.canActivate(context);
  }
}

// common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = GqlExecutionContext.create(context).getContext().req;
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// common/decorators/public.decorator.ts, roles.decorator.ts
export const Public = () => SetMetadata('isPublic', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

// Register guards globally in AppModule (APP_GUARD is the idiomatic global registration)
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

// Clean resolver
@Resolver()
@Roles(Role.Admin) // Applied to every query and mutation on this resolver
export class AdminResolver {
  @Query(() => [User])
  users(): Promise<User[]> {
    return this.adminService.getUsers();
  }

  @Mutation(() => Boolean)
  deleteUser(@Args('id') id: string): Promise<boolean> {
    return this.adminService.deleteUser(id);
  }

  @Public() // Override: no auth required
  @Query(() => String)
  health(): string {
    return 'ok';
  }
}
```

Registering an app-wide guard with `APP_GUARD` in `AppModule` is the one documented exception to "AppModule lists modules, not providers": enhancer registrations (`APP_GUARD`, `APP_PIPE`, `APP_FILTER`, `APP_INTERCEPTOR`) must live in the composition root, while everything a feature owns stays in its feature module (see `nestjs-graphql-structure` -> `module-bootstrap` and `module-feature-module`).

Reference: [NestJS Guards](https://docs.nestjs.com/guards)

---

### 4.5 Validate All Input with Input Types and Pipes

**Impact: HIGH** — First line of defense against attacks

Always validate incoming data using class-validator decorators on GraphQL inputs, the global ValidationPipe, and per-argument pipes. Never trust user input. Validate all mutation inputs, query arguments, and field arguments before processing. In GraphQL, use `@InputType()` for inputs and `@ArgsType()` for grouped arguments (filters, paging, sorting — more than about two, or a logical group) — never one in place of the other, and never an HTTP `@Body()` DTO. A lone scalar argument may stay raw, but it must still be validated: `@Args('id', ParseUUIDPipe) id: string`.

**Incorrect (trust raw input without validation):**

```typescript
// Trust raw input without validation
@Resolver(() => User)
export class UsersMutationResolver {
  @Mutation(() => User)
  createUser(@Args('input') input: any) {
    // input could contain anything - SQL injection, XSS, etc.
    return this.usersService.create(input);
  }

  @Query(() => [User])
  users(@Args('limit') limit: any) {
    // limit could be "'; DROP TABLE users; --"
    return this.usersService.findAll(limit);
  }
}

// Input types without validation decorators
@InputType()
export class CreateUserInput {
  @Field()
  name: string;    // No validation

  @Field()
  email: string;   // Could be "not-an-email"

  @Field()
  age: number;     // Could be "abc" or -999
}
```

**Correct (validated inputs and args with global ValidationPipe):**

```typescript
// Enable ValidationPipe globally in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,              // Strip unknown properties
      forbidNonWhitelisted: true,   // Throw on unknown properties
      transform: true,              // Auto-transform to input types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

// Create well-validated input types
import {
  IsString,
  IsEmail,
  IsInt,
  Min,
  Max,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// dto/create-user.input.ts
@InputType()
export class CreateUserInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @Field()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @Field()
  @IsInt()
  @Min(0)
  @Max(150)
  age: number;

  @Field()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase, and number',
  })
  password: string;
}

// dto/find-users.args.ts — grouped arguments (search, paging) are an @ArgsType(), never an @InputType()
@ArgsType()
export class FindUsersArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}

// modules/users/resolvers/users.mutation.resolver.ts
@Resolver(() => User)
export class UsersMutationResolver {
  @Mutation(() => User)
  createUser(@Args('input') input: CreateUserInput): Promise<User> {
    // input is guaranteed to be valid
    return this.usersService.create(input);
  }
}

// modules/users/resolvers/users.query.resolver.ts
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => [User])
  users(@Args() args: FindUsersArgs): Promise<User[]> {
    // args.limit is a number, args.search is sanitized
    return this.usersService.findAll(args);
  }

  @Query(() => User)
  user(@Args('id', ParseUUIDPipe) id: string): Promise<User> {
    // a lone scalar argument stays raw but is validated by the pipe
    return this.usersService.findById(id);
  }
}
```

Reference: [NestJS Validation](https://docs.nestjs.com/techniques/validation) | [GraphQL Resolvers - Validation](https://docs.nestjs.com/graphql/resolvers)

---

## 5. Performance

**Section Impact: HIGH**

### 5.1 Use Async Lifecycle Hooks Correctly

**Impact: HIGH** — Improper async handling blocks application startup

NestJS lifecycle hooks (`onModuleInit`, `onApplicationBootstrap`, etc.) support async operations. However, misusing them can block application startup or cause race conditions. Understand the lifecycle order and use hooks appropriately.

**Incorrect (fire-and-forget async without await):**

```typescript
// Fire-and-forget async without await
@Injectable()
export class DatabaseService implements OnModuleInit {
  onModuleInit() {
    // This runs but doesn't block - app starts before DB is ready!
    this.connect();
  }

  private async connect() {
    await this.pool.connect();
    console.log('Database connected');
  }
}

// Heavy blocking operations in constructor
@Injectable()
export class ConfigService {
  private config: Config;

  constructor() {
    // BLOCKS entire module instantiation synchronously
    this.config = fs.readFileSync('config.json');
  }
}
```

**Correct (return promises from async hooks):**

```typescript
// Return promise from async hooks
@Injectable()
export class DatabaseService implements OnModuleInit {
  private pool: Pool;

  async onModuleInit(): Promise<void> {
    // NestJS waits for this to complete before continuing
    await this.pool.connect();
    console.log('Database connected');
  }

  async onModuleDestroy(): Promise<void> {
    // Clean up resources on shutdown
    await this.pool.end();
    console.log('Database disconnected');
  }
}

// Use onApplicationBootstrap for cross-module dependencies
@Injectable()
export class CacheWarmerService implements OnApplicationBootstrap {
  constructor(
    private cache: CacheService,
    private products: ProductsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // All modules are initialized, safe to warm cache
    const products = await this.products.findPopular();
    await this.cache.warmup(products);
  }
}

// Heavy init in async hooks, not constructor
@Injectable()
export class ConfigService implements OnModuleInit {
  private config: Config;

  constructor() {
    // Keep constructor synchronous and fast
  }

  async onModuleInit(): Promise<void> {
    // Async loading in lifecycle hook
    this.config = await this.loadConfig();
  }

  private async loadConfig(): Promise<Config> {
    const file = await fs.promises.readFile('config.json');
    return JSON.parse(file.toString());
  }

  get<T>(key: string): T {
    return this.config[key];
  }
}

// Enable shutdown hooks in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // Enable SIGTERM/SIGINT handling
  await app.listen(3000);
}
```

Reference: [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events)

---

### 5.2 Use Lazy Loading for Large Modules

**Impact: MEDIUM** — Improves startup time for large applications

NestJS supports lazy-loading modules, which defers initialization until first use. This is valuable for large applications where some features are rarely used, serverless deployments where cold start time matters, or when certain modules have heavy initialization costs.

**Incorrect (loading everything eagerly):**

```typescript
// Load everything eagerly in a large app
@Module({
  imports: [
    UsersModule,
    OrdersModule,
    PaymentsModule,
    ReportsModule, // Heavy, rarely used
    AnalyticsModule, // Heavy, rarely used
    AdminModule, // Only admins use this
    LegacyModule, // Migration module, rarely used
    BulkImportModule, // Used once a month
  ],
})
export class AppModule {}

// All modules initialize at startup, even if never used
// Slow cold starts in serverless
// Memory wasted on unused modules
```

**Correct (lazy load rarely-used modules):**

```typescript
// Use LazyModuleLoader for optional modules
import { LazyModuleLoader } from '@nestjs/core';

@Injectable()
export class ReportsService {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async generateReport(type: string): Promise<Report> {
    // Load module only when needed
    const { ReportsModule } = await import('./reports/reports.module');
    const moduleRef = await this.lazyModuleLoader.load(() => ReportsModule);

    const reportsService = moduleRef.get(ReportsGeneratorService);
    return reportsService.generate(type);
  }
}

// Lazy load admin features with caching
@Injectable()
export class AdminService {
  private adminModule: ModuleRef | null = null;

  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  private async getAdminModule(): Promise<ModuleRef> {
    if (!this.adminModule) {
      const { AdminModule } = await import('./admin/admin.module');
      this.adminModule = await this.lazyModuleLoader.load(() => AdminModule);
    }
    return this.adminModule;
  }

  async runAdminTask(task: string): Promise<void> {
    const moduleRef = await this.getAdminModule();
    const taskRunner = moduleRef.get(AdminTaskRunner);
    await taskRunner.run(task);
  }
}

// Reusable lazy loader service
@Injectable()
export class ModuleLoaderService {
  private loadedModules = new Map<string, ModuleRef>();

  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async load<T>(
    key: string,
    importFn: () => Promise<{ default: Type<T> } | Type<T>>,
  ): Promise<ModuleRef> {
    if (!this.loadedModules.has(key)) {
      const module = await importFn();
      const moduleType = 'default' in module ? module.default : module;
      const moduleRef = await this.lazyModuleLoader.load(() => moduleType);
      this.loadedModules.set(key, moduleRef);
    }
    return this.loadedModules.get(key)!;
  }
}

// Preload modules in background after startup
@Injectable()
export class ModulePreloader implements OnApplicationBootstrap {
  constructor(private lazyModuleLoader: LazyModuleLoader) {}

  async onApplicationBootstrap(): Promise<void> {
    setTimeout(async () => {
      await this.preloadModule(() => import('./reports/reports.module'));
    }, 5000); // 5 seconds after startup
  }

  private async preloadModule(importFn: () => Promise<any>): Promise<void> {
    try {
      const module = await importFn();
      const moduleType = module.default || Object.values(module)[0];
      await this.lazyModuleLoader.load(() => moduleType);
    } catch (error) {
      console.warn('Failed to preload module', error);
    }
  }
}
```

Reference: [NestJS Lazy Loading Modules](https://docs.nestjs.com/fundamentals/lazy-loading-modules)

---

### 5.3 Optimize Database Queries

**Impact: HIGH** — Database queries are typically the largest source of latency

Select only needed columns, use proper indexes, avoid over-fetching, and consider query performance when designing your data access. Most API slowness traces back to inefficient database queries. For GraphQL, relations are resolved on demand with a request-scoped DataLoader — not by widening the parent query — and large lists are paged with a cursor (see `db-avoid-n-plus-one`).

**Incorrect (over-fetching data and missing indexes):**

```typescript
// Select everything when you need few fields
@Injectable()
export class UsersService {
  async findAllEmails(): Promise<string[]> {
    const users = await this.repo.find();
    // Fetches ALL columns for ALL users
    return users.map((u) => u.email);
  }

  async getProfile(id: string): Promise<User> {
    return this.repo.findOne({
      where: { id },
      populate: ['posts', 'posts.comments', 'posts.comments.author', 'followers'],
    });
    // Over-fetches a massive relation tree the client may never request
  }
}

// No indexes on frequently queried columns
@Schema()
export class Order {
  @Prop()
  userId: string; // No index - full collection scan on every lookup

  @Prop()
  status: string; // No index - slow status filtering
}
```

**Correct (select only needed data with proper indexes):**

```typescript
// Select only needed columns
@Injectable()
export class UsersService {
  async findAllEmails(): Promise<string[]> {
    const users = await this.repo.find({}, { email: 1 });
    // Only fetches the email column
    return users.map((u) => u.email);
  }

  // Use an aggregation pipeline for complex selections
  async getUserSummary(id: string): Promise<UserSummary> {
    return this.repo.aggregate([
      { $match: { _id: new Types.ObjectId(id) } },
      { $project: { name: 1, postCount: { $size: '$postIds' } } },
    ]);
  }
}

// Add indexes on frequently queried fields
@Schema({ collection: 'orders' })
export class Order {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ index: true })
  status: string;

  @Prop()
  createdAt: Date;
}

// Compound index for a common query pattern
OrderSchema.index({ userId: 1, status: 1 });

// Page large datasets with a cursor (keyset) — the GraphQL default
@Injectable()
export class OrdersService {
  async findPage(first = 20, after?: string): Promise<Order[]> {
    return this.ordersRepository.find(
      {
        ...(after ? { createdAt: { $lt: new Date(after) } } : {}),
      },
      {
        sort: { createdAt: -1 },
        limit: first,
      },
    );
  }
}
```

Return a cursor-based `Paginated<T>` from the resolver (see `type-pagination` in `nestjs-graphql-structure`). Use offset `page`/`limit` only for a small, bounded, non-growing list.

Reference: [MongoDB Indexes](https://www.mongodb.com/docs/manual/indexes/) | [TypeORM Query Builder](https://typeorm.io/select-query-builder)

---

### 5.4 Use Caching Strategically

**Impact: HIGH** — Dramatically reduces database load and response times

Implement caching for expensive operations, frequently accessed data, and external API calls. Use NestJS CacheModule with appropriate TTLs and cache invalidation strategies. Don't cache everything - focus on high-impact areas.

**Incorrect (no caching or caching everything):**

```typescript
// No caching for expensive, repeated queries
@Injectable()
export class ProductsService {
  async getPopular(): Promise<Product[]> {
    // Runs complex aggregation query EVERY request
    return this.productsRepo
      .createQueryBuilder('p')
      .leftJoin('p.orders', 'o')
      .select('p.*, COUNT(o.id) as orderCount')
      .groupBy('p.id')
      .orderBy('orderCount', 'DESC')
      .limit(20)
      .getMany();
  }
}

// Cache everything without thought
@Injectable()
export class UsersService {
  @CacheKey('users')
  @CacheTTL(3600)
  @UseInterceptors(CacheInterceptor)
  async findAll(): Promise<User[]> {
    // Caching user list for 1 hour is wrong if data changes frequently
    return this.usersRepo.find();
  }
}
```

**Correct (strategic caching with proper invalidation):**

```typescript
// Setup caching module
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new KeyvRedis(config.get('REDIS_URL')),
        ],
        ttl: 60 * 1000, // Default 60s
      }),
    }),
  ],
})
export class AppModule {}

// Manual caching for granular control
@Injectable()
export class ProductsService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private productsRepo: ProductRepository,
  ) {}

  async getPopular(): Promise<Product[]> {
    const cacheKey = 'products:popular';

    // Try cache first
    const cached = await this.cache.get<Product[]>(cacheKey);
    if (cached) return cached;

    // Cache miss - fetch and cache
    const products = await this.fetchPopularProducts();
    await this.cache.set(cacheKey, products, 5 * 60 * 1000); // 5 min TTL
    return products;
  }

  // Invalidate cache on changes
  async updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
    const product = await this.productsRepo.save({ id, ...input });
    await this.cache.del('products:popular'); // Invalidate
    return product;
  }
}

// Decorator-based caching for GraphQL. Define GraphQLCacheInterceptor once in
// common/interceptors/ (see use-interceptors) — the GraphQL-aware version derives its
// key from the field and its args, so findOne(id: 'a') and findOne(id: 'b') never
// share an entry (unlike a static @CacheKey).

// Apply it per resolver; @SetMetadata('cacheTTL', ...) sets the TTL
@Resolver(() => Category)
@UseInterceptors(GraphQLCacheInterceptor)
export class CategoriesQueryResolver {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Query(() => [Category])
  @SetMetadata('cacheTTL', 30 * 60 * 1000) // 30 minutes - categories rarely change
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }

  @Query(() => Category)
  @SetMetadata('cacheTTL', 60 * 1000) // 1 minute - keyed per id
  findOne(@Args('id', ParseObjectIdPipe) id: string): Promise<Category> {
    return this.categoriesService.findOne(id);
  }
}

// Nest's built-in CacheInterceptor is for plain HTTP surfaces only, where one
// static @CacheKey is acceptable. Never put it on a GraphQL resolver: the static
// key ignores the resolver's arguments and every caller shares a single entry.
@Controller('categories')
@UseInterceptors(CacheInterceptor)
export class CategoriesController {
  @Get()
  @CacheTTL(30 * 60 * 1000)
  @CacheKey('categories:all')
  findAll(): Promise<Category[]> {
    return this.categoriesService.findAll();
  }
}

// Event-based cache invalidation
@Injectable()
export class CacheInvalidationService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  @OnEvent('product.created')
  @OnEvent('product.updated')
  @OnEvent('product.deleted')
  async invalidateProductCaches(event: ProductEvent) {
    await Promise.all([
      this.cache.del('products:popular'),
      this.cache.del(`product:${event.productId}`),
    ]);
  }
}
```

Reference: [NestJS Caching](https://docs.nestjs.com/techniques/caching)

---

## 6. Testing

**Section Impact: MEDIUM-HIGH**

### 6.1 Use Supertest for E2E Testing

**Impact: HIGH** — Validates the full request/response cycle

End-to-end tests use Supertest to make real HTTP requests against your NestJS application. In a code-first GraphQL app that means POSTing a query or mutation to the single GraphQL endpoint (default `/graphql`) and asserting on `res.body.data` / `res.body.errors`. They test the full stack — guards, pipes, interceptors, and the generated schema. E2E specs live in the top-level `test/` folder as `test/<feature>.e2e-spec.ts`.

**Incorrect (only unit-testing resolvers, or an e2e without setup/teardown):**

```typescript
// Only unit test the resolver
describe('UsersResolver', () => {
  it('should return users', async () => {
    const service = { findAll: jest.fn().mockResolvedValue([]) };
    const resolver = new UsersResolver(service as any);

    const result = await resolver.users();

    expect(result).toEqual([]);
    // Doesn't test: guards, pipes, interceptors, the schema
  });
});

// E2E tests without proper setup/teardown
describe('Users API', () => {
  it('should create user', async () => {
    const app = await NestFactory.create(AppModule);
    // No proper initialization
    // No cleanup after test
    // Hits real database
  });
});
```

**Correct (proper E2E setup with Supertest against the GraphQL endpoint):**

```typescript
// test/users.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same config as production
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('createUser mutation', () => {
    it('should create a user', () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `
            mutation($input: CreateUserInput!) {
              createUser(input: $input) { _id name email }
            }
          `,
          variables: { input: { name: 'John', email: 'john@test.com' } },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors).toBeUndefined();
          expect(res.body.data.createUser.name).toBe('John');
          expect(res.body.data.createUser.email).toBe('john@test.com');
        });
    });

    it('should report a validation error for an invalid email', () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `mutation($input: CreateUserInput!) { createUser(input: $input) { _id } }`,
          variables: { input: { name: 'John', email: 'invalid-email' } },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors[0].message).toContain('email');
        });
    });
  });

  describe('user query', () => {
    it('should return an error for a non-existent user', () => {
      return request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `query($id: String!) { user(id: $id) { _id } }`,
          variables: { id: '000000000000000000000000' },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors[0].extensions.code).toBe('USER_NOT_FOUND');
        });
    });
  });
});

// GraphQL returns 200 with an `errors` array — assert on it, not on HTTP status
describe('Protected queries (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Get auth token
    const loginResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `mutation($input: LoginInput!) { login(input: $input) { accessToken } }`,
        variables: { input: { email: 'test@test.com', password: 'password' } },
      });

    authToken = loginResponse.body.data.login.accessToken;
  });

  it('should return an UNAUTHENTICATED error without a token', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query: `query { me { _id email } }` })
      .expect(200)
      .expect((res) => {
        expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
      });
  });

  it('should return the profile with a valid token', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ query: `query { me { email } }` })
      .expect(200)
      .expect((res) => {
        expect(res.body.data.me.email).toBe('test@test.com');
      });
  });
});

// Database isolation for E2E tests
describe('Orders (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          envFilePath: '.env.test', // Test database config
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    connection = moduleFixture.get<Connection>(getConnectionToken());
    await app.init();
  });

  beforeEach(async () => {
    // Clean database between tests
    await connection.dropDatabase();
  });

  afterAll(async () => {
    await connection.close();
    await app.close();
  });
});
```

Reference: [NestJS E2E Testing](https://docs.nestjs.com/fundamentals/testing#end-to-end-testing) | [GraphQL over HTTP](https://graphql.org/learn/serving-over-http/)

---

### 6.2 Mock External Services in Tests

**Impact: HIGH** — Ensures fast, reliable, deterministic tests

Never call real external services (APIs, databases, message queues) in unit tests. Mock them to ensure tests are fast, deterministic, and don't incur costs. Use realistic mock data and test edge cases like timeouts and errors.

**Incorrect (calling real APIs and databases):**

```typescript
// Call real APIs in tests
describe('PaymentService', () => {
  it('should process payment', async () => {
    const service = new PaymentService(new StripeClient(realApiKey));
    // Hits real Stripe API!
    const result = await service.charge('tok_visa', 1000);
    // Slow, costs money, flaky
  });
});

// Use real database
describe('UsersService', () => {
  beforeEach(async () => {
    await connection.query('DELETE FROM users'); // Modifies real DB
  });

  it('should create user', async () => {
    const user = await service.create({ email: 'test@test.com' });
    // Side effects on shared database
  });
});

// Incomplete mocks
const mockHttpService = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  // Missing error scenarios, missing other methods
};
```

**Correct (mock all external dependencies):**

```typescript
// Mock HTTP service properly
describe('WeatherService', () => {
  let service: WeatherService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WeatherService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WeatherService);
    httpService = module.get(HttpService);
  });

  it('should return weather data', async () => {
    const mockResponse = {
      data: { temperature: 72, humidity: 45 },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    };

    httpService.get.mockReturnValue(of(mockResponse));

    const result = await service.getWeather('NYC');

    expect(result).toEqual({ temperature: 72, humidity: 45 });
  });

  it('should handle API timeout', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('ETIMEDOUT')),
    );

    await expect(service.getWeather('NYC')).rejects.toThrow('Weather service unavailable');
  });

  it('should handle rate limiting', async () => {
    httpService.get.mockReturnValue(
      throwError(() => ({
        response: { status: 429, data: { message: 'Rate limited' } },
      })),
    );

    await expect(service.getWeather('NYC')).rejects.toThrow(TooManyRequestsException);
  });
});

// Mock repository instead of database
describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('should find user by id', async () => {
    const mockUser = { id: '1', name: 'John', email: 'john@test.com' };
    repo.findOne.mockResolvedValue(mockUser);

    const result = await service.findById('1');

    expect(result).toEqual(mockUser);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: '1' } });
  });
});

// Create mock factory for complex SDKs
function createMockStripe(): jest.Mocked<Stripe> {
  return {
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
      cancel: jest.fn(),
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
  } as any;
}

// Mock time for time-dependent tests
describe('TokenService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should expire token after 1 hour', async () => {
    const token = await service.createToken();

    // Fast-forward time
    jest.advanceTimersByTime(61 * 60 * 1000);

    expect(await service.isValid(token)).toBe(false);
  });
});
```

Reference: [Jest Mocking](https://jestjs.io/docs/mock-functions)

---

### 6.3 Use Testing Module for Unit Tests

**Impact: HIGH** — Enables proper isolated testing with mocked dependencies

Use `@nestjs/testing` module to create isolated test environments with mocked dependencies. This ensures your tests run fast, don't depend on external services, and properly test your business logic in isolation.

**Incorrect (manual instantiation bypassing DI):**

```typescript
// Instantiate services manually without DI
describe('UsersService', () => {
  it('should create user', async () => {
    // Manual instantiation bypasses DI
    const repo = new UserRepository(); // Real repo!
    const service = new UsersService(repo);

    const user = await service.create({ name: 'Test' });
    // This hits the real database!
  });
});

// Test implementation details
describe('UsersMutationResolver', () => {
  it('should call service', async () => {
    const service = { create: jest.fn() };
    const resolver = new UsersMutationResolver(service as any);

    await resolver.createUser({ name: 'Test' });

    expect(service.create).toHaveBeenCalled(); // Tests implementation, not behavior
  });
});
```

**Correct (use Test.createTestingModule with mocked dependencies):**

```typescript
// Use Test.createTestingModule for proper DI
import { Test, TestingModule } from '@nestjs/testing';

describe('UsersService', () => {
  let service: UsersService;
  let repo: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UserRepository,
          useValue: {
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(UserRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should save and return user', async () => {
      const dto = { name: 'John', email: 'john@test.com' };
      const expectedUser = { id: '1', ...dto };

      repo.save.mockResolvedValue(expectedUser);

      const result = await service.create(dto);

      expect(result).toEqual(expectedUser);
      expect(repo.save).toHaveBeenCalledWith(dto);
    });

    it('should throw on duplicate email', async () => {
      repo.findOne.mockResolvedValue({ id: '1', email: 'test@test.com' });

      await expect(
        service.create({ name: 'Test', email: 'test@test.com' }),
      ).rejects.toThrow(EmailAlreadyRegisteredException);
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const user = { id: '1', name: 'John' };
      repo.findOne.mockResolvedValue(user);

      const result = await service.findById('1');

      expect(result).toEqual(user);
    });

    it('should throw UserNotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findById('999')).rejects.toThrow(UserNotFoundException);
    });
  });
});

// Testing guards and interceptors
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  it('should allow when no roles required', () => {
    const context = createMockGqlExecutionContext({ user: { roles: [] } });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow admin for an admin-only resolver', () => {
    const context = createMockGqlExecutionContext({ user: { roles: ['admin'] } });
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    expect(guard.canActivate(context)).toBe(true);
  });
});

// GraphQL guards read the request through GqlExecutionContext, so the mock
// ExecutionContext must expose the GraphQL args: [root, args, context, info].
function createMockGqlExecutionContext(
  request: Partial<Request>,
): ExecutionContext {
  const gqlArgs = [null, null, { req: request }, null];
  return {
    getArgs: () => gqlArgs,
    getArgByIndex: (index: number) => gqlArgs[index],
    getType: () => 'graphql',
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}
```

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)

---

## 7. Database & ORM

**Section Impact: MEDIUM-HIGH**

### 7.1 Avoid N+1 Query Problems

**Impact: HIGH** — N+1 queries are one of the most common performance killers

N+1 queries occur when a list of parents is fetched, then one extra query runs for each parent to load related data. In GraphQL this happens the moment a field resolver runs once per parent. Batch those per-parent loads with a request-scoped `DataLoader`; for a single aggregate, use one query/join in the repository. Never issue a query per parent inside a field resolver, and do not eager-load GraphQL relations in the parent query.

**Incorrect (lazy loading in loops and in field resolvers causes N+1):**

```typescript
// A field resolver that queries once per parent
// modules/posts/resolvers/user-posts.resolver.ts — the data owner (PostsModule) owns User.posts
@Resolver(() => User)
export class UserPostsResolver {
  @ResolveField(() => [Post])
  posts(@Parent() user: User): Promise<Post[]> {
    // Runs once per user => N queries
    return this.postsService.findByUserId(user._id.toString());
  }
}

// Accessing lazy relations while serializing a list does the same
@Query(() => [User])
async users(): Promise<User[]> {
  const users = await this.usersService.findAll();
  return users; // Each user.posts access = 1 query
}
```

**Correct (batch with a request-scoped DataLoader):**

```typescript
// Use DataLoader for GraphQL to batch and cache per-parent loads
import DataLoader from 'dataloader';

// modules/posts/loaders/posts.loader.ts — one instance per request, in the data-owner module
@Injectable({ scope: Scope.REQUEST })
export class PostsLoader {
  constructor(private readonly postsService: PostsService) {}

  private readonly byUserId = new DataLoader<string, Post[]>(async (userIds) => {
    // One query for every user's posts
    const posts = await this.postsService.findByUserIds([...userIds]);

    // Group by userId
    const postsMap = new Map<string, Post[]>();
    for (const post of posts) {
      const userPosts = postsMap.get(post.userId) || [];
      userPosts.push(post);
      postsMap.set(post.userId, userPosts);
    }

    // Return in the same order as the input keys (DataLoader contract)
    return userIds.map((id) => postsMap.get(id) || []);
  });

  loadByUserId(id: string): Promise<Post[]> {
    return this.byUserId.load(id);
  }
}

// modules/posts/resolvers/user-posts.resolver.ts — the loader batches every call in the tick
// into one query; the data owner (PostsModule) owns the field (see relations-owning-module)
@Resolver(() => User)
export class UserPostsResolver {
  constructor(private readonly postsLoader: PostsLoader) {}

  @ResolveField(() => [Post])
  posts(@Parent() user: User): Promise<Post[]> {
    return this.postsLoader.loadByUserId(user._id.toString());
  }
}

// For a computed aggregate, compute it in the database, in the data-owner module, not in a loop
@Injectable()
export class PostsService {
  countByUserIds(userIds: string[]): Promise<Map<string, number>> {
    return this.postsRepository.countByUserIds(userIds);
    // e.g. a Mongo aggregation: { $group: { _id: '$userId', count: { $sum: 1 } } }
  }
}

// Enable query logging in development to detect N+1
MongooseModule.forRoot(uri, {
  // dev only: log every query so a per-parent query stands out
});
```

The loader's lifetime and placement are owned by `relations-dataloader` in `nestjs-graphql-structure` (file `loaders/<feature>.loader.ts`, class `<Feature>Loader`, in the module that owns the data); this rule owns making the batch function itself do one query. A relation field whose data lives in another module is declared and resolved in that module — see `relations-owning-module`.

Reference: [graphql/dataloader](https://github.com/graphql/dataloader)

---

### 7.2 Use Database Migrations

**Impact: HIGH** — Enables safe, repeatable database schema changes

Never apply schema changes by hand. Use migrations for all schema changes. Migrations provide version control for your database, enable safe rollbacks, and ensure consistency across all environments. The connection and the migrations both live in `infra/database/` — configured once from typed config, never in a feature module or the composition root.

The examples below use TypeORM. If your project uses Mongoose (see `db-avoid-n-plus-one` and the data rules in `nestjs-graphql-structure`), apply the same principle with its migration tooling — for example `migrate-mongo` — keeping the migrations under `infra/database/migrations/`.

**Incorrect (manual schema changes, no home for migrations):**

```typescript
// Manual SQL in production
@Injectable()
export class DatabaseService {
  async addField(): Promise<void> {
    await this.dataSource.query('ALTER TABLE users ADD COLUMN age INT');
    // No version control, no rollback, inconsistent across envs
  }
}

// Feature module owns the connection
// modules/users/users.module.ts
@Module({ imports: [MongooseModule.forRoot(process.env.MONGO_URI)] })
export class UsersModule {}

// migrations/0001-init.ts dumped at the repository root
```

**Correct (one infrastructure module; migrations under infra/database/):**

```typescript
// infra/database/data-source.ts — used by the migration CLI
export const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/infra/database/migrations/*.js'],
  synchronize: false, // Always false outside local development
  migrationsRun: true, // Run migrations on startup
});

// infra/database/database.module.ts — the connection is configured once
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        synchronize: false, // Only enabled locally, never in production
        migrations: ['dist/infra/database/migrations/*.js'],
        migrationsRun: true,
        autoLoadEntities: true,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

// a feature registers only the entities it owns
@Module({ imports: [TypeOrmModule.forFeature([User])] })
export class UsersModule {}

// infra/database/migrations/1705312800000-AddUserAge.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAge1705312800000 implements MigrationInterface {
  name = 'AddUserAge1705312800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add column with default to handle existing rows
    await queryRunner.query(`
      ALTER TABLE "users" ADD "age" integer DEFAULT 0
    `);

    // Add index for frequently queried columns
    await queryRunner.query(`
      CREATE INDEX "IDX_users_age" ON "users" ("age")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Always implement down for rollback
    await queryRunner.query(`DROP INDEX "IDX_users_age"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "age"`);
  }
}

// Safe column rename (two-step)
export class RenameNameToFullName1705312900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Add new column
    await queryRunner.query(`
      ALTER TABLE "users" ADD "full_name" varchar(255)
    `);

    // Step 2: Copy data
    await queryRunner.query(`
      UPDATE "users" SET "full_name" = "name"
    `);

    // Step 3: Add NOT NULL constraint
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "full_name" SET NOT NULL
    `);

    // Step 4: Drop old column (after verifying app works)
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "name" varchar(255)`);
    await queryRunner.query(`UPDATE "users" SET "name" = "full_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "full_name"`);
  }
}
```

Reference: [TypeORM Migrations](https://typeorm.io/migrations)

---

### 7.3 Use Transactions for Multi-Step Operations

**Impact: HIGH** — Ensures data consistency in multi-step operations

When multiple database operations must succeed or fail together, wrap them in a transaction. This prevents partial updates that leave your data in an inconsistent state. Use TypeORM's transaction APIs or the DataSource query runner for complex scenarios.

The examples below use TypeORM. If your project uses Mongoose (see `db-avoid-n-plus-one` and the data rules in `nestjs-graphql-structure`), wrap the same steps in a MongoDB session transaction (`session.withTransaction(...)`) inside the repository.

**Incorrect (multiple saves without transaction):**

```typescript
// Multiple saves without transaction
@Injectable()
export class OrdersService {
  async createOrder(userId: string, items: OrderItem[]): Promise<Order> {
    // If any step fails, data is inconsistent
    const order = await this.orderRepo.save({ userId, status: 'pending' });

    for (const item of items) {
      await this.orderItemRepo.save({ orderId: order.id, ...item });
      await this.inventoryRepo.decrement({ productId: item.productId }, 'stock', item.quantity);
    }

    await this.paymentService.charge(order.id);
    // If payment fails, order and inventory are already modified!

    return order;
  }
}
```

**Correct (use DataSource.transaction for automatic rollback):**

```typescript
// Use DataSource.transaction() for automatic rollback
@Injectable()
export class OrdersService {
  constructor(private dataSource: DataSource) {}

  async createOrder(userId: string, items: OrderItem[]): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      // All operations use the same transactional manager
      const order = await manager.save(Order, { userId, status: 'pending' });

      for (const item of items) {
        await manager.save(OrderItem, { orderId: order.id, ...item });
        await manager.decrement(
          Inventory,
          { productId: item.productId },
          'stock',
          item.quantity,
        );
      }

      // If this throws, everything rolls back
      await this.paymentService.chargeWithManager(manager, order.id);

      return order;
    });
  }
}

// QueryRunner for manual transaction control
@Injectable()
export class TransferService {
  constructor(private dataSource: DataSource) {}

  async transfer(fromId: string, toId: string, amount: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Debit source account
      await queryRunner.manager.decrement(
        Account,
        { id: fromId },
        'balance',
        amount,
      );

      // Verify sufficient funds
      const source = await queryRunner.manager.findOne(Account, {
        where: { id: fromId },
      });
      if (source.balance < 0) {
        // Throwing rolls the transaction back; the domain exception is mapped to a
        // GraphQL error by the global filter (see error-use-exception-filters).
        throw new InsufficientFundsException(fromId);
      }

      // Credit destination account
      await queryRunner.manager.increment(
        Account,
        { id: toId },
        'balance',
        amount,
      );

      // Log the transaction
      await queryRunner.manager.save(TransactionLog, {
        fromId,
        toId,
        amount,
        timestamp: new Date(),
      });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}

// Repository method with transaction support
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  async createWithProfile(
    userInput: CreateUserInput,
    profileInput: CreateProfileInput,
  ): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(User, userInput);
      await manager.save(Profile, { ...profileInput, userId: user.id });
      return user;
    });
  }
}
```

Reference: [TypeORM Transactions](https://typeorm.io/transactions)

---

## 8. Cross-Cutting Concerns

**Section Impact: MEDIUM**

### 8.1 Use Interceptors for Cross-Cutting Concerns

**Impact: MEDIUM-HIGH** — Interceptors provide clean separation for cross-cutting logic

Interceptors can transform responses, add logging, handle caching, and measure performance without polluting your business logic. They wrap the resolver execution. Interceptors work identically in GraphQL resolvers via `@UseInterceptors()`; shared interceptors live in `common/interceptors/`, and read the request through `GqlExecutionContext`.

**Incorrect (logging and transformation in every resolver):**

```typescript
// Logging in every resolver method
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => [User])
  async users(): Promise<User[]> {
    const start = Date.now();
    this.logger.log('users query called');

    const users = await this.usersService.findAll();

    this.logger.log(`users query completed in ${Date.now() - start}ms`);
    return users;
  }
  // Repeated in every method!
}

// Manual response wrapping
@Query(() => UserWrapper)
async users(): Promise<{ data: User[]; meta: Meta }> {
  const users = await this.usersService.findAll();
  return {
    data: users,
    meta: { timestamp: new Date(), count: users.length },
  };
}
```

**Correct (use interceptors for cross-cutting concerns):**

```typescript
// common/interceptors/logging.interceptor.ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQL');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo();
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${info.parentType.name}.${info.fieldName} - ${Date.now() - now}ms`,
          );
        },
        error: (error) => {
          this.logger.error(
            `${info.parentType.name}.${info.fieldName} - ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }
}

// common/interceptors/timeout.interceptor.ts
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          throw new RequestTimeoutException('Request timed out');
        }
        throw err;
      }),
    );
  }
}

// main.ts — bootstrap registers the global interceptors
app.useGlobalInterceptors(
  app.get(LoggingInterceptor),
  new TimeoutInterceptor(),
);

// Or per-resolver
@Resolver(() => User)
@UseInterceptors(LoggingInterceptor)
export class UsersQueryResolver {
  @Query(() => [User])
  async users(): Promise<User[]> {
    // Clean business logic only
    return this.usersService.findAll();
  }
}

// Custom cache interceptor with TTL
@Injectable()
export class GraphQLCacheInterceptor implements NestInterceptor {
  constructor(
    private cacheManager: Cache,
    private reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const cacheKey = this.generateKey(context);
    const ttl = this.reflector.get<number>('cacheTTL', context.getHandler()) || 300;

    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return of(cached);
    }

    return next.handle().pipe(
      tap((response) => {
        this.cacheManager.set(cacheKey, response, ttl);
      }),
    );
  }

  private generateKey(context: ExecutionContext): string {
    const info = GqlExecutionContext.create(context).getInfo();
    return `gql:${info.parentType.name}.${info.fieldName}:${JSON.stringify(context.getArgByIndex(1))}`;
  }
}

// Usage with custom TTL
@Query(() => [User])
@UseInterceptors(GraphQLCacheInterceptor)
@SetMetadata('cacheTTL', 600)
async users(): Promise<User[]> {
  return this.usersService.findAll();
}
```

Apply interceptors at the resolver class level:
```typescript
@Resolver(() => User)
@UseInterceptors(LoggingInterceptor, TimeoutInterceptor)
export class UsersQueryResolver {
  // All resolver methods now have interceptors applied
}
```

Reference: [NestJS Interceptors](https://docs.nestjs.com/interceptors) | [GraphQL Other Features](https://docs.nestjs.com/graphql/other-features)

---

### 8.2 Use Pipes for Input Transformation

**Impact: MEDIUM** — Pipes ensure clean, validated data reaches your resolvers

Use built-in pipes like `ParseIntPipe`, `ParseUUIDPipe`, and `DefaultValuePipe` for common transformations. Create custom pipes for business-specific transformations. Pipes separate validation/transformation logic from resolvers. Pipes work identically in GraphQL resolvers via `@UsePipes()` decorator. When several arguments form a group (pagination, filters, sorting), put them on an `@ArgsType()` class and let the `ValidationPipe` transform it — do not scatter raw `@Args()` scalars. A lone scalar argument validated by a pipe (`@Args('id', ParseUUIDPipe) id: string`) stays as-is; `@ArgsType()` is for grouped arguments.

**Incorrect (manual type parsing in resolvers):**

```typescript
// Manual type parsing in resolvers
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => User)
  async user(@Args('id') id: string): Promise<User> {
    // Manual validation in every resolver
    const uuid = id.trim();
    if (!isUUID(uuid)) {
      throw new BadRequestException('Invalid UUID');
    }
    return this.usersService.findOne(uuid);
  }

  @Query(() => [Product])
  async search(@Args('price') price: string): Promise<Product[]> {
    const priceNum = +price; // NaN if invalid, no error
    return this.productsService.findByPrice(priceNum);
  }
}
```

**Correct (use built-in and custom pipes):**

```typescript
// Use built-in pipes for common transformations
@Resolver(() => User)
export class UsersQueryResolver {
  @Query(() => User)
  async user(@Args('id', ParseUUIDPipe) id: string): Promise<User> {
    // id is guaranteed to be a valid UUID
    return this.usersService.findOne(id);
  }

  @Query(() => [User])
  async byStatus(
    @Args('status', new ParseEnumPipe(UserStatus)) status: UserStatus,
  ): Promise<User[]> {
    return this.usersService.findByStatus(status);
  }
}

// Custom pipe for business logic
@Injectable()
export class ParseDatePipe implements PipeTransform<string, Date> {
  transform(value: string): Date {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return date;
  }
}

@Query(() => [Report])
async reports(
  @Args('from', ParseDatePipe) from: Date,
  @Args('to', ParseDatePipe) to: Date,
): Promise<Report[]> {
  return this.reportsService.findBetween(from, to);
}

// Custom transformation pipe
@Injectable()
export class NormalizeEmailPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value;
    return value.trim().toLowerCase();
  }
}

@Query(() => [Product])
async products(
  @Args('email', NormalizeEmailPipe) email: string,
): Promise<Product[]> {
  return this.productsService.findByEmail(email);
}

// Sanitize HTML input
@Injectable()
export class SanitizeHtmlPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) return value;
    return sanitizeHtml(value, { allowedTags: [] });
  }
}

// Global validation pipe with transformation
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip non-DTO properties
    transform: true, // Auto-transform to DTO types
    transformOptions: {
      enableImplicitConversion: true,
    },
    forbidNonWhitelisted: true, // Throw on extra properties
  }),
);

// Grouped arguments with transformation decorators — an @ArgsType(), never an @InputType()
@ArgsType()
export class FindProductsArgs {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @Field({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsString()
  search?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}

@Query(() => [Product])
async products(@Args() args: FindProductsArgs): Promise<Product[]> {
  // args is already transformed and validated
  return this.productsService.findAll(args);
}

// Pipe error customization
@Injectable()
export class CustomParseIntPipe extends ParseIntPipe {
  constructor() {
    super({
      exceptionFactory: (error) =>
        new BadRequestException(`${error} must be a valid integer`),
    });
  }
}

// Or use options on built-in pipes
@Query(() => Item)
async item(
  @Args(
    'id',
    new ParseIntPipe({
      errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE,
      exceptionFactory: () => new NotAcceptableException('ID must be numeric'),
    }),
  )
  id: number,
): Promise<Item> {
  return this.itemsService.findOne(id);
}
```

Apply pipes at the resolver class level:
```typescript
@Resolver(() => User)
@UsePipes(ValidationPipe)
export class UsersQueryResolver {
  // All resolver methods now have ValidationPipe applied
}
```

Reference: [NestJS Pipes](https://docs.nestjs.com/pipes) | [GraphQL Resolvers - Validation](https://docs.nestjs.com/graphql/resolvers)

---

### 8.3 Control Response Exposure with GraphQL Types

**Impact: MEDIUM** — Type design prevents accidental data exposure and ensures consistency

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

---

## 9. Microservices

**Section Impact: MEDIUM**

### 9.1 Use Message and Event Patterns Correctly

**Impact: MEDIUM** — Proper patterns ensure reliable microservice communication

NestJS microservices support two communication patterns: request-response (MessagePattern) and event-based (EventPattern). Use MessagePattern when you need a response, and EventPattern for fire-and-forget notifications. Understanding the difference prevents communication bugs.

**Incorrect (using wrong pattern for use case):**

```typescript
// Use @MessagePattern for fire-and-forget
@Controller()
export class NotificationsController {
  @MessagePattern('user.created')
  async handleUserCreated(data: UserCreatedEvent) {
    // This WAITS for response, blocking the sender
    await this.emailService.sendWelcome(data.email);
    // If email fails, sender gets an error (coupling!)
  }
}

// Use @EventPattern expecting a response
@Controller()
export class OrdersController {
  @EventPattern('inventory.check')
  async checkInventory(data: CheckInventoryDto) {
    const available = await this.inventory.check(data);
    return available; // This return value is IGNORED with @EventPattern!
  }
}

// Tight coupling in client
@Injectable()
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const user = await this.repo.save(dto);

    // Blocks until notification service responds
    await this.client.send('user.created', user).toPromise();
    // If notification service is down, user creation fails!

    return user;
  }
}
```

**Correct (use MessagePattern for request-response, EventPattern for fire-and-forget):**

```typescript
// MessagePattern: Request-Response (when you NEED a response)
@Controller()
export class InventoryController {
  @MessagePattern({ cmd: 'check_inventory' })
  async checkInventory(data: CheckInventoryDto): Promise<InventoryResult> {
    const result = await this.inventoryService.check(data.productId, data.quantity);
    return result; // Response sent back to caller
  }
}

// Client expects response
@Injectable()
export class OrdersService {
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // Check inventory - we NEED this response to proceed
    const inventory = await firstValueFrom(
      this.inventoryClient.send<InventoryResult>(
        { cmd: 'check_inventory' },
        { productId: dto.productId, quantity: dto.quantity },
      ),
    );

    if (!inventory.available) {
      throw new BadRequestException('Insufficient inventory');
    }

    return this.repo.save(dto);
  }
}

// EventPattern: Fire-and-Forget (for notifications, side effects)
@Controller()
export class NotificationsController {
  @EventPattern('user.created')
  async handleUserCreated(data: UserCreatedEvent): Promise<void> {
    // No return value needed - just process the event
    await this.emailService.sendWelcome(data.email);
    await this.analyticsService.track('user_signup', data);
    // If this fails, it doesn't affect the sender
  }
}

// Client emits event without waiting
@Injectable()
export class UsersService {
  async createUser(dto: CreateUserDto): Promise<User> {
    const user = await this.repo.save(dto);

    // Fire and forget - doesn't block, doesn't wait
    this.eventClient.emit('user.created', {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    });

    return user; // User creation succeeds regardless of event handling
  }
}

// Hybrid pattern for critical events
@Injectable()
export class OrdersService {
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.repo.save(dto);

    // Critical: inventory reservation (use MessagePattern)
    const reserved = await firstValueFrom(
      this.inventoryClient.send({ cmd: 'reserve_inventory' }, {
        orderId: order.id,
        items: dto.items,
      }),
    );

    if (!reserved.success) {
      await this.repo.delete(order.id);
      throw new BadRequestException('Could not reserve inventory');
    }

    // Non-critical: notifications (use EventPattern)
    this.eventClient.emit('order.created', {
      orderId: order.id,
      userId: dto.userId,
      total: dto.total,
    });

    return order;
  }
}

// Error handling patterns
// MessagePattern errors propagate to caller
@MessagePattern({ cmd: 'get_user' })
async getUser(userId: string): Promise<User> {
  const user = await this.repo.findOne({ where: { id: userId } });
  if (!user) {
    throw new RpcException('User not found'); // Received by caller
  }
  return user;
}

// EventPattern errors should be handled locally
@EventPattern('order.created')
async handleOrderCreated(data: OrderCreatedEvent): Promise<void> {
  try {
    await this.processOrder(data);
  } catch (error) {
    // Log and potentially retry - don't throw
    this.logger.error('Failed to process order event', error);
    await this.deadLetterQueue.add(data);
  }
}
```

Reference: [NestJS Microservices](https://docs.nestjs.com/microservices/basics)

---

### 9.2 Use Message Queues for Background Jobs

**Impact: MEDIUM-HIGH** — Queues enable reliable background processing

Use `@nestjs/bullmq` for background job processing. Queues decouple long-running tasks from the request path, enable retry logic, and distribute workload across workers. Use them for emails, file processing, notifications, and any task that shouldn't block a request. The queue connection is one-time infrastructure in `infra/queue/`; the processors and scheduled jobs live with the feature that owns the data they touch.

**Incorrect (long-running work inline on the request path):**

```typescript
// modules/reports/resolvers/reports.mutation.resolver.ts
@Mutation(() => Report)
async generateReport(@Args('input') input: ReportInput): Promise<Report> {
  // This blocks the request for potentially minutes
  const data = await this.fetchLargeDataset(input);
  const report = await this.processData(data); // Slow!
  await this.sendEmail(input.email, report); // Can fail!
  return report; // Client times out
}

// Fire-and-forget without retry
@Injectable()
export class EmailService {
  async sendWelcome(email: string): Promise<void> {
    // If this fails, email is never sent
    await this.mailer.send({ to: email, template: 'welcome' });
    // No retry, no tracking, no visibility
  }
}

// Use setInterval for scheduled tasks
setInterval(async () => {
  await cleanupOldRecords();
}, 60000); // No error handling, memory leaks
```

**Correct (BullMQ; connection in infra/, processors in the owning feature):**

```typescript
// infra/queue/queue.module.ts — the queue connection is configured once
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('queue.host'),
          port: config.get<number>('queue.port'),
        },
        defaultJobOptions: {
          removeOnComplete: 1000,
          removeOnFail: 5000,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueInfraModule {}

// modules/reports/reports.module.ts — the feature registers its own queue
@Module({
  imports: [
    BullModule.registerQueue({ name: 'reports' }),
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
  ],
  providers: [ReportsService, ReportsProcessor, ReportsJob, ReportsQueryResolver],
})
export class ReportsModule {}

// modules/reports/services/reports.service.ts — producer: return immediately, process in background
@Injectable()
export class ReportsService {
  constructor(@InjectQueue('reports') private readonly reportsQueue: Queue) {}

  async requestReport(input: ReportInput): Promise<{ jobId: string }> {
    const job = await this.reportsQueue.add('generate', input, {
      priority: input.urgent ? 1 : 10,
      delay: input.scheduledFor ? Date.parse(input.scheduledFor) - Date.now() : 0,
    });

    return { jobId: job.id };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = await this.reportsQueue.getJob(jobId);
    return {
      status: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
    };
  }
}

// modules/reports/processors/reports.processor.ts — consumer in the owning feature
@Processor('reports')
export class ReportsProcessor {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(private readonly reportsService: ReportsService) {}

  @Process('generate')
  async generateReport(job: Job<ReportInput>): Promise<void> {
    this.logger.log(`Processing report job ${job.id}`);

    await job.updateProgress(10);
    const data = await this.reportsService.fetchData(job.data);
    await job.updateProgress(50);
    await this.reportsService.processData(data);
    await job.updateProgress(100);
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}

// modules/notifications/services/notifications.service.ts — enqueue with retry
@Injectable()
export class NotificationsService {
  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  async sendWelcome(user: User): Promise<void> {
    await this.emailQueue.add(
      'send',
      { to: user.email, template: 'welcome', data: { name: user.name } },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}

// modules/reports/jobs/reports.job.ts — scheduled work lives in jobs/, not via setInterval
@Injectable()
export class ReportsJob {
  constructor(private readonly reportsService: ReportsService) {}

  @Cron('0 0 * * *')
  async cleanupOldReports(): Promise<void> {
    await this.reportsService.cleanupOldReports();
  }

  @Cron('0 * * * *')
  async sendDigest(): Promise<void> {
    await this.reportsService.sendDigest();
  }
}
```

**Queue monitoring** is an infrastructure concern: register Bull Board under `infra/queue/` (or an app-level admin module), not inside a feature.

Reference: [NestJS Queues](https://docs.nestjs.com/techniques/queues) | [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)

---

## 10. DevOps & Deployment

**Section Impact: LOW-MEDIUM**

### 10.1 Implement Graceful Shutdown

**Impact: MEDIUM-HIGH** — Proper shutdown handling ensures zero-downtime deployments

Handle SIGTERM and SIGINT signals to gracefully shutdown your NestJS application. Stop accepting new requests, wait for in-flight requests to complete, close database connections, and clean up resources. This prevents data loss and connection errors during deployments.

**Incorrect (ignoring shutdown signals):**

```typescript
// Ignore shutdown signals
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  // App crashes immediately on SIGTERM
  // In-flight requests fail
  // Database connections are abruptly closed
}

// Long-running tasks without cancellation
@Injectable()
export class ProcessingService {
  async processLargeFile(file: File): Promise<void> {
    // No way to interrupt this during shutdown
    for (let i = 0; i < file.chunks.length; i++) {
      await this.processChunk(file.chunks[i]);
      // May run for minutes, blocking shutdown
    }
  }
}
```

**Correct (enable shutdown hooks and handle cleanup):**

```typescript
// Enable shutdown hooks in main.ts — Nest subscribes to SIGTERM/SIGINT, runs
// onModuleDestroy / onApplicationShutdown on every provider, then closes the HTTP
// server. Do not attach your own signal handlers that call app.close() again.
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Nest handles SIGTERM and SIGINT and drains the app through the lifecycle hooks
  app.enableShutdownHooks();

  await app.listen(3000);

  // Optional: a forced-exit watchdog. This listener only starts a timer and never
  // calls app.close() — Nest's shutdown hooks do the closing. If the process is
  // still alive after the deadline, exit hard.
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  signals.forEach((signal) => {
    process.on(signal, () => {
      console.log(`Received ${signal}, waiting for graceful shutdown...`);

      setTimeout(() => {
        console.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 30000).unref();
    });
  });
}

// Lifecycle hooks for cleanup
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly connections: Connection[] = [];

  async onApplicationShutdown(signal?: string): Promise<void> {
    console.log(`Database service shutting down on ${signal}`);

    // Close all connections gracefully
    await Promise.all(
      this.connections.map((conn) => conn.close()),
    );

    console.log('All database connections closed');
  }
}

// Queue processor with graceful shutdown
@Injectable()
export class QueueService implements OnApplicationShutdown, OnModuleDestroy {
  private isShuttingDown = false;

  onModuleDestroy(): void {
    this.isShuttingDown = true;
  }

  async onApplicationShutdown(): Promise<void> {
    // Wait for current jobs to complete
    await this.queue.close();
  }

  async processJob(job: Job): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Service is shutting down');
    }
    await this.doWork(job);
  }
}

// WebSocket gateway cleanup
@WebSocketGateway()
export class EventsGateway implements OnApplicationShutdown {
  @WebSocketServer()
  server: Server;

  async onApplicationShutdown(): Promise<void> {
    // Notify all connected clients
    this.server.emit('shutdown', { message: 'Server is shutting down' });

    // Close all connections
    this.server.disconnectSockets();
  }
}

// Health check integration
@Injectable()
export class ShutdownService {
  private isShuttingDown = false;

  startShutdown(): void {
    this.isShuttingDown = true;
  }

  isShutdown(): boolean {
    return this.isShuttingDown;
  }
}

// The readiness query lives in the app-level health module (modules/health/),
// not in AppModule or in a controller (see devops-use-health-checks).
// modules/health/health.resolver.ts
@Resolver()
export class HealthResolver {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: MongooseHealthIndicator,
    private readonly shutdownService: ShutdownService,
  ) {}

  @Query(() => HealthCheckResult, { name: 'healthReady' })
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    // Report not-ready during shutdown so the orchestrator stops sending traffic
    if (this.shutdownService.isShutdown()) {
      throw new ServiceUnavailableException('Shutting down');
    }

    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }
}

// Integrate with shutdown
@Injectable()
export class AppShutdownService implements OnApplicationShutdown {
  constructor(private shutdownService: ShutdownService) {}

  async onApplicationShutdown(): Promise<void> {
    // Mark as unhealthy first
    this.shutdownService.startShutdown();

    // Wait for k8s to update endpoints
    await this.sleep(5000);

    // Then proceed with cleanup
  }
}

// Request tracking for in-flight requests
@Injectable()
export class RequestTracker implements NestMiddleware, OnApplicationShutdown {
  private activeRequests = 0;
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private resolveShutdown: (() => void) | null = null;

  use(req: Request, res: Response, next: NextFunction): void {
    if (this.isShuttingDown) {
      res.status(503).send('Service Unavailable');
      return;
    }

    this.activeRequests++;

    res.on('finish', () => {
      this.activeRequests--;
      if (this.isShuttingDown && this.activeRequests === 0 && this.resolveShutdown) {
        this.resolveShutdown();
      }
    });

    next();
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.activeRequests > 0) {
      console.log(`Waiting for ${this.activeRequests} requests to complete`);
      this.shutdownPromise = new Promise((resolve) => {
        this.resolveShutdown = resolve;
      });

      // Wait with timeout
      await Promise.race([
        this.shutdownPromise,
        new Promise((resolve) => setTimeout(resolve, 30000)),
      ]);
    }

    console.log('All requests completed');
  }
}
```

Reference: [NestJS Lifecycle Events](https://docs.nestjs.com/fundamentals/lifecycle-events)

---

### 10.2 Keep a .env.example in Sync with Configuration

**Impact: LOW-MEDIUM** — New environments boot without guesswork

Every real env file is gitignored, so a committed `.env.example` is the only record of what the
application reads. Treat it as part of the configuration surface: whenever you add, rename, or
remove a variable in a `config/` namespace or the validation schema, update `.env.example` in the
same change. This is what lets a new developer or a new deployment know which variables to set
before the app boots — startup validation (see `devops-use-config-module`) then tells them which
values are still missing.

**Incorrect (variable added to the schema but not to the example):**

```typescript
// config/validation.schema.ts — STRIPE_KEY is now required at startup
export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  STRIPE_KEY: Joi.string().required(), // added here...
  JWT_SECRET: Joi.string().min(32).required(),
});

// .env.example — ...but never added here
// PORT=3000
// JWT_SECRET=replace-me

// Result: a fresh clone boots, fails on STRIPE_KEY, and no file says the variable exists.
```

```bash
# .env.example committed WITH real values — the secrets leak into the repository
JWT_SECRET=super-secret-production-key
DB_PASSWORD=prod-db-password
```

Why it is wrong: the example drifts from the schema the moment a variable is added, so the only
description of the configuration surface is out of date, and any real secret placed in it is
committed to history.

**Correct (one place lists every variable; changes land together):**

```bash
# .env.example — committed; placeholders only, grouped by namespace, never a real secret
# --- app ---
NODE_ENV=development
PORT=3000
API_PREFIX=api

# --- database ---
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your-user
DB_PASSWORD=your-password
DB_NAME=your-database

# --- auth ---
# Min 32 chars, generate with: openssl rand -hex 32
JWT_SECRET=your-jwt-secret
```

```typescript
// config/app.config.ts — same namespace, same variables as the example
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  environment: process.env.NODE_ENV ?? 'development',
  apiPrefix: process.env.API_PREFIX ?? 'api',
}));

// config/validation.schema.ts — every variable the example lists is validated here
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
});
```

Rules of thumb:

- Adding a configurable variable is a **three-place change**: its namespace in `config/`, its entry
  in `validation.schema.ts`, and its line in `.env.example`. Miss the third and the surface is
  undocumented; miss the second and it is unvalidated.
- `.env.example` is documentation, never loaded at runtime — it is not read by `envFilePath`.
- Use placeholder values (`your-password`, `replace-me`), never real credentials. Commit it; keep
  the real `.env*` files gitignored.
- Remove a variable's line when the variable is removed, so the example does not accumulate settings
  nobody reads.
- Keep both `.env.example` and `.env.test.example` (or a documented `NODE_ENV=test` section) when
  e2e tests use their own env file (see `test-e2e-supertest`).

Reference: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration) | [The Twelve-Factor App — Config](https://12factor.net/config)

**Behavioral depth.** See `devops-use-config-module` for the validated-namespace pattern this rule documents.

---

### 10.3 Use ConfigModule for Environment Configuration

**Impact: LOW-MEDIUM** — Proper configuration prevents deployment failures

Use `@nestjs/config` for environment-based configuration. Validate configuration at startup to fail fast on misconfigurations. Use namespaced configuration for organization and type safety. Config namespaces live in `config/`; infrastructure (such as the database connection) consumes them from `infra/`, not from the composition root.

**Incorrect (accessing process.env directly):**

```typescript
// Access process.env directly
@Injectable()
export class DatabaseService {
  constructor() {
    // No validation, can fail at runtime
    this.connection = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT), // NaN if missing
      password: process.env.DB_PASSWORD, // undefined if missing
    });
  }
}

// Scattered env access
@Injectable()
export class EmailService {
  sendEmail() {
    // Different services access env differently
    const apiKey = process.env.SENDGRID_API_KEY || 'default';
    // Typos go unnoticed: process.env.SENDGRID_API_KY
  }
}
```

**Correct (use @nestjs/config with validation):**

```typescript
// Setup validated configuration
import { ConfigModule, ConfigService, registerAs } from '@nestjs/config';
import * as Joi from 'joi';

// config/database.config.ts
export const databaseConfig = registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  name: process.env.DB_NAME,
}));

// config/app.config.ts
export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  environment: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || 'api',
}));

// config/validation.schema.ts
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  REDIS_URL: Joi.string().uri().required(),
});

// app.module.ts — the composition root loads config and lists modules
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Available everywhere without importing
      load: [databaseConfig, appConfig],
      validationSchema,
      validationOptions: {
        abortEarly: true, // Stop on first error
        allowUnknown: true, // Allow other env vars
      },
    }),
    DatabaseModule,     // infra/database — consumes ConfigService
    GraphqlInfraModule, // infra/graphql
    UsersModule,
  ],
})
export class AppModule {}

// infra/database/database.module.ts — infrastructure consumes typed config
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('database.host'),
        port: config.get('database.port'),
        username: config.get('database.username'),
        password: config.get('database.password'),
        database: config.get('database.name'),
        autoLoadEntities: true,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

// Type-safe configuration access
export interface AppConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  apiPrefix: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

// Type-safe access
@Injectable()
export class AppService {
  constructor(private config: ConfigService) {}

  getPort(): number {
    // Type-safe with generic
    return this.config.get<number>('app.port');
  }

  getDatabaseConfig(): DatabaseConfig {
    return this.config.get<DatabaseConfig>('database');
  }
}

// Inject namespaced config directly
@Injectable()
export class DatabaseService {
  constructor(
    @Inject(databaseConfig.KEY)
    private dbConfig: ConfigType<typeof databaseConfig>,
  ) {
    // Full type inference!
    const host = this.dbConfig.host; // string
    const port = this.dbConfig.port; // number
  }
}

// Environment files support
ConfigModule.forRoot({
  envFilePath: [
    `.env.${process.env.NODE_ENV}.local`,
    `.env.${process.env.NODE_ENV}`,
    '.env.local',
    '.env',
  ],
});

// .env.development
// DB_HOST=localhost
// DB_PORT=5432

// .env.production
// DB_HOST=prod-db.example.com
// DB_PORT=5432
```

Reference: [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)

---

### 10.4 Implement Health Checks

**Impact: MEDIUM-HIGH** — Health checks enable orchestrators to manage service lifecycle

Implement liveness and readiness probes using `@nestjs/terminus`. Liveness checks determine if the service should be restarted. Readiness checks determine if the service can accept traffic. Health is an app-level module, not a domain feature: `modules/health/` holds one small module and its providers.

**Incorrect (a ping that doesn't check dependencies, wired into the composition root):**

```typescript
// app.module.ts owns an operational concern
@Module({ providers: [HealthService], controllers: [HealthController] })
export class AppModule {}

// Simple ping that doesn't check dependencies
@Controller('health')
export class HealthController {
  @Get()
  check(): string {
    return 'OK'; // Service might be unhealthy but returns OK
  }
}
```

**Correct (an app-level health module using @nestjs/terminus):**

```typescript
// modules/health/health.resolver.ts
@Resolver()
export class HealthResolver {
  constructor(
    private health: HealthCheckService,
    private db: MongooseHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  // Liveness — is the service alive?
  @Query(() => HealthCheckResult, { name: 'health' })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024), // 200MB
    ]);
  }

  // Readiness — can the service handle traffic?
  @Query(() => HealthCheckResult, { name: 'healthReady' })
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024),
    ]);
  }
}

// modules/health/health.module.ts
@Module({
  imports: [TerminusModule],
  providers: [HealthResolver],
})
export class HealthModule {}

// app.module.ts — one flat list of modules, domain and app-level alike
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    GraphqlInfraModule,
    UsersModule,
    HealthModule,
  ],
})
export class AppModule {}
```

**Custom indicators for business-specific health:**

```typescript
@Injectable()
export class QueueHealthIndicator extends HealthIndicator {
  constructor(private queueService: QueueService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const queueStats = await this.queueService.getStats();

    const isHealthy = queueStats.failedCount < 100;
    const result = this.getStatus(key, isHealthy, {
      waiting: queueStats.waitingCount,
      active: queueStats.activeCount,
      failed: queueStats.failedCount,
    });

    if (!isHealthy) {
      throw new HealthCheckError('Queue unhealthy', result);
    }

    return result;
  }
}

// Registered in the health module and used by the resolver
@Query(() => HealthCheckResult, { name: 'healthReady' })
@HealthCheck()
ready() {
  return this.health.check([
    () => this.db.pingCheck('database'),
    () => this.queue.isHealthy('job-queue'),
  ]);
}
```

**Respecting shutdown state:**

```typescript
@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private isShuttingDown = false;

  isShutdown(): boolean {
    return this.isShuttingDown;
  }

  async onApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true;
    // Wait for in-flight requests
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

// In the health resolver: report not-ready once shutdown has started
@Query(() => HealthCheckResult, { name: 'healthReady' })
@HealthCheck()
ready() {
  if (this.shutdownService.isShutdown()) {
    throw new ServiceUnavailableException('Shutting down');
  }

  return this.health.check([() => this.db.pingCheck('database')]);
}
```

Wire your orchestrator's probes to the health module's queries; the module, not `AppModule`, owns the endpoint.

Reference: [NestJS Terminus](https://docs.nestjs.com/recipes/terminus)

---

### 10.5 Use Structured Logging

**Impact: MEDIUM-HIGH** — Structured logging enables effective debugging and monitoring

Use NestJS Logger with structured JSON output in production. Include contextual information (request ID, user ID, operation) to trace requests across services. Avoid console.log and implement proper log levels.

**Incorrect (using console.log in production):**

```typescript
// Use console.log in production
@Injectable()
export class UsersService {
  async createUser(input: CreateUserInput): Promise<User> {
    console.log('Creating user:', input);
    // Not structured, no levels, lost in production logs

    try {
      const user = await this.repo.save(input);
      console.log('User created:', user.id);
      return user;
    } catch (error) {
      console.log('Error:', error); // Using log for errors
      throw error;
    }
  }
}

// Log sensitive data
console.log('Login attempt:', { email, password }); // SECURITY RISK!

// Inconsistent log format
logger.log('User ' + userId + ' created at ' + new Date());
// Hard to parse, no structure
```

**Correct (use structured logging with context):**

```typescript
// Configure the application logger in main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Install the JSON logger so every log line is structured JSON.
  // JsonLogger is registered as a provider (common/logger/logger.module.ts).
  app.useLogger(app.get(JsonLogger));

  await app.listen(3000);
}

// Custom logger for JSON output — implements every LoggerService method
@Injectable()
export class JsonLogger implements LoggerService {
  log(message: any, ...optionalParams: any[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: any, ...optionalParams: any[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: any, ...optionalParams: any[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: any, ...optionalParams: any[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: any, ...optionalParams: any[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: string, message: any, optionalParams: any[]): void {
    // Object params become structured fields; the context string comes last
    const fields = Object.assign(
      {},
      ...optionalParams.filter((p) => p !== null && typeof p === 'object'),
    );
    const strings = optionalParams.filter((p) => typeof p === 'string');
    const context = strings[strings.length - 1];

    const line = JSON.stringify({
      level,
      timestamp: new Date().toISOString(),
      context,
      message,
      ...fields,
    });

    if (level === 'error' || level === 'fatal') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }
}

// Structured output: inject the JSON logger and pass fields as objects.
// The object params are merged into the JSON line.
@Injectable()
export class UsersService {
  constructor(
    private readonly logger: JsonLogger,
    private readonly repo: UsersRepository,
  ) {}

  async createUser(input: CreateUserInput): Promise<User> {
    this.logger.log('Creating user', UsersService.name, { email: input.email });

    try {
      const user = await this.repo.save(input);
      this.logger.log('User created', UsersService.name, { userId: user.id });
      return user;
    } catch (error) {
      this.logger.error(
        'Failed to create user',
        error.stack,
        UsersService.name,
        { email: input.email },
      );
      throw error;
    }
  }
}

// The built-in Logger is fine for plain messages only. Its second argument is a
// string context and it does not emit structured fields — use JsonLogger (or
// Pino, below) whenever you need key/value data in the log line.
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  ping(): void {
    this.logger.log('Health check passed');
  }

  warnSlow(): void {
    this.logger.warn('Database responded slowly');
  }
}

// Request context logging with ClsModule
import { ClsModule, ClsService } from 'nestjs-cls';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
      },
    }),
  ],
})
export class AppModule {}

// Middleware to set request context
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private cls: ClsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.headers['x-request-id'] || randomUUID();
    this.cls.set('requestId', requestId);
    this.cls.set('userId', req.user?.id);

    res.setHeader('x-request-id', requestId);
    next();
  }
}

// Logger that includes request context
@Injectable()
export class ContextLogger {
  constructor(private cls: ClsService) {}

  log(message: string, data?: object): void {
    console.log(
      JSON.stringify({
        level: 'info',
        timestamp: new Date().toISOString(),
        requestId: this.cls.get('requestId'),
        userId: this.cls.get('userId'),
        message,
        ...data,
      }),
    );
  }

  error(message: string, error: Error, data?: object): void {
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        requestId: this.cls.get('requestId'),
        userId: this.cls.get('userId'),
        message,
        error: error.message,
        stack: error.stack,
        ...data,
      }),
    );
  }
}

// Pino integration for high-performance logging
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        redact: ['req.headers.authorization', 'req.body.password'],
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            query: req.query,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
  ],
})
export class AppModule {}

// Usage with Pino
@Injectable()
export class UsersService {
  constructor(private logger: PinoLogger) {
    this.logger.setContext(UsersService.name);
  }

  async findOne(id: string): Promise<User> {
    this.logger.info({ userId: id }, 'Finding user');
    // Pino uses first arg for data, second for message
  }
}
```

Reference: [NestJS Logger](https://docs.nestjs.com/techniques/logger)

---

## References

- https://docs.nestjs.com
- https://github.com/nestjs/nest
- https://typeorm.io
- https://github.com/typestack/class-validator
- https://github.com/goldbergyoni/nodebestpractices

---

*Generated by build-agents.ts on 2026-10-17*
