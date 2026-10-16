---
title: Put Subscription Resolvers in resolvers/ with PubSub in infra/
impact: HIGH
impactDescription: one place for real-time entry points and the PubSub provider
tags: graphql, subscriptions, pubsub, realtime
---

## Put Subscription Resolvers in resolvers/ with PubSub in infra/

**Impact: HIGH (one place for real-time entry points and the PubSub provider)**

**Purpose.** A GraphQL subscription is a third resolver role alongside query and mutation.
Subscription resolvers live in the feature's `resolvers/` folder, named by role, and stay thin —
they subscribe to a topic and map the payload. The `PubSub` engine they use is one-time
infrastructure: a single provider in `infra/pubsub/`, swapping the in-memory engine for a Redis
one in production.

**Placement.**

- Subscription resolver: `modules/<feature>/resolvers/<feature>.subscription.resolver.ts`
  (class `<Feature>SubscriptionResolver`).
- PubSub provider: `src/infra/pubsub/pubsub.providers.ts`.
- WebSocket/subscription transport option: `infra/graphql/graphql.module.ts` (the `subscriptions`
  config).

**Responsibilities.**

- Declare `@Subscription(() => Type)` methods that subscribe to a named topic.
- Emit to the same topic from the owning service (see `relations-events` for the emit-side pattern).
- Provide one `PubSub` instance in `infra/pubsub/`, injected where needed.

**Never.**

- Emit events from a subscription resolver — emit from the service that owns the state change.
- Create a `new PubSub()` per resolver or per feature; it is one shared provider.
- Put a subscription resolver in `common/` or inside a service.

**Incorrect (a PubSub instance per feature, topic emitted from the resolver):**

```typescript
// modules/orders/resolvers/orders.subscription.resolver.ts
const pubSub = new PubSub(); // a second instance — events never reach other instances

@Subscription(() => Order)
orderCreated() {
  pubSub.publish('order.created', { orderCreated: {} }); // emitting from the resolver
  return pubSub.asyncIterableIterator('order.created');
}
```

Why it is wrong: each `new PubSub()` is isolated, so the subscription may never receive the event,
and the resolver emits instead of the service that changed the state.

**Correct (one shared PubSub in infra/, thin subscription resolver):**

```typescript
// infra/pubsub/pubsub.providers.ts
export const PUB_SUB = 'PUB_SUB';
export const pubSubProvider: Provider = {
  provide: PUB_SUB,
  useValue: new PubSub(), // swap this one provider for a Redis-backed PubSub in production
};

// modules/orders/resolvers/orders.subscription.resolver.ts
@Resolver(() => Order)
export class OrdersSubscriptionResolver {
  constructor(@Inject(PUB_SUB) private readonly pubSub: PubSub) {}

  @Subscription(() => Order, { name: 'orderCreated' })
  orderCreated() {
    return this.pubSub.asyncIterableIterator('order.created');
  }
}

// modules/orders/services/orders.service.ts — the state owner emits
this.pubSub.publish('order.created', { orderCreated: order });
```

Why it is right: one PubSub instance is shared across the app, the resolver only subscribes, and
the state-owning service emits.

Reference: [NestJS GraphQL Subscriptions](https://docs.nestjs.com/graphql/subscriptions) | [NestJS GraphQL Other features](https://docs.nestjs.com/graphql/other-features)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-use-events`.
