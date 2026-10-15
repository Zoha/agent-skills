---
title: Resolve Cross-Module Fields via the Owning Service
impact: CRITICAL
impactDescription: the module boundary stays intact
tags: modules, relations, services
---

## Resolve Cross-Module Fields via the Owning Service

**Impact: CRITICAL (the module boundary stays intact)**

**Purpose.** When a field on one type is backed by data owned by another feature (`User.orders`
backed by the orders feature), resolve it by injecting the owning module's exported **service**.
Import that module; never reach into its repository, entity, or model. This keeps each module's
data private and its public interface explicit.

**Placement.** The field resolver lives in the type-owning module
(`modules/users/resolvers/users.field.resolver.ts`); its dependency comes from
`modules/orders/` and arrives through `OrdersModule`'s `exports`.

**Responsibilities.**

- Import the owning module in this module's `imports`.
- Inject the owning module's exported **service**.
- Depend on a service contract, not on another module's storage.
- Wrap that service in a loader owned by the module that declares the field when batching is
  needed (see `relations-dataloader`).

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

**Correct (import the owning module, inject its exported service):**

```typescript
// OrdersModule exports OrdersService — its public API (see module-export-policy)
@Module({ imports: [OrdersModule], providers: [UserOrdersLoader] })
export class UsersModule {}

// The module that declares the field owns the loader and wraps the injected service.
@Injectable({ scope: Scope.REQUEST })
export class UserOrdersLoader {
  constructor(private readonly ordersService: OrdersService) {}

  private readonly byUser = new DataLoader<string, Order[]>((ids) =>
    this.ordersService.findByUserIds([...ids]),
  );

  loadByUserId(id: string): Promise<Order[]> {
    return this.byUser.load(id);
  }
}

@Resolver(() => User)
export class UsersFieldResolver {
  constructor(private readonly ordersLoader: UserOrdersLoader) {}

  @ResolveField(() => [Order])
  orders(@Parent() user: User): Promise<Order[]> {
    return this.ordersLoader.loadByUserId(user._id.toString());
  }
}
```

Why it is right: the orders feature owns orders data and exposes one entry point (`OrdersService`);
the users feature depends on that service and keeps its own batched loader, so the boundary stays
intact and orders storage can change freely.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)

**Behavioral depth.** See `nestjs-best-practices` -> `arch-module-sharing`.
