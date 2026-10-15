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
folder and are created per request as request-scoped providers.

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
