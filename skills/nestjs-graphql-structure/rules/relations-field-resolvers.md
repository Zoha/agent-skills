---
title: Resolve Relations with @ResolveField
impact: CRITICAL
impactDescription: resolve relations on demand, not eagerly
tags: graphql, resolvefield, relations
---

## Resolve Relations with @ResolveField

**Impact: CRITICAL (resolve relations on demand, not eagerly)**

**Purpose.** A relation exposed on a type — a field pointing to other objects — is resolved with an
`@ResolveField` method, on demand, only when the client requests it. Never eager-load relations in
the parent query. This rule covers the mechanic; *which file* the resolver lives in is decided by
`resolver-per-type` (the type's own module) or `relations-owning-module` (another module's type).

**Placement.** The file belongs to the type it resolves: `<type>.resolver.ts` in that type's own
module (see `resolver-per-type`), or the extending module's file when it extends another module's
type (see `relations-owning-module`). The method name matches the GraphQL field.

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
// orders/resolvers/order.resolver.ts — Order and OrderItem are both owned by OrdersModule
@Resolver(() => Order)
export class OrderResolver {
  constructor(private readonly orderItemsLoader: OrderItemsLoader) {}

  @ResolveField(() => [OrderItem])
  items(@Parent() order: Order): Promise<OrderItem[]> {
    return this.orderItemsLoader.loadByOrderId(order._id.toString());
  }
}
```

Why it is right: the field is resolved only when asked, from the parent already in hand, by the
module that owns order items.

For a type with several field resolvers, keep them all in its one per-type file — see
`resolver-per-type`.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

**Behavioral depth.** See `nestjs-best-practices` -> `db-avoid-n-plus-one`.
