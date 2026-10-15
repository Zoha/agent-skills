---
title: Resolve Cross-Module Fields via the Owning Service
impact: CRITICAL
impactDescription: the module boundary stays intact
tags: modules, relations, services
---

## Resolve Cross-Module Fields via the Owning Service

**Impact: CRITICAL (the module boundary stays intact)**

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
