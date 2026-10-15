---
title: Batch Relations with a Per-Request DataLoader
impact: CRITICAL
impactDescription: eliminates N+1 on relational fields
tags: dataloader, n+1, loaders
---

## Batch Relations with a Per-Request DataLoader

**Impact: CRITICAL (eliminates N+1 on relational fields)**

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
