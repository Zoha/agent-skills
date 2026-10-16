---
title: Optimize Database Queries
impact: HIGH
impactDescription: Database queries are typically the largest source of latency
tags: performance, database, queries, optimization
---

## Optimize Database Queries

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
