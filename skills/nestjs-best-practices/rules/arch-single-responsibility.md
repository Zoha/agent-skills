---
title: Single Responsibility for Services
impact: CRITICAL
impactDescription: "40%+ improvement in testability"
tags: architecture, services, single-responsibility
---

## Single Responsibility for Services

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
