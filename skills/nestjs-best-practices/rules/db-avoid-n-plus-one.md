---
title: Avoid N+1 Query Problems
impact: HIGH
impactDescription: N+1 queries are one of the most common performance killers
tags: database, n-plus-one, dataloader, performance
---

## Avoid N+1 Query Problems

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
