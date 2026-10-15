---
title: Keep Service Methods Small and Focused
impact: HIGH
impactDescription: easier to read, test, and change
tags: services, responsibility, readability, refactoring
---

## Keep Service Methods Small and Focused

**Impact: HIGH (easier to read, test, and change)**

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
