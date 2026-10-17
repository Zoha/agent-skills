---
title: Enqueue Indexing; Never Write to Elasticsearch Inline
impact: CRITICAL
impactDescription: "writes never block on Elasticsearch"
tags: sync, queues, events, indexing
---

## Enqueue Indexing; Never Write to Elasticsearch Inline

**Impact: CRITICAL** — writes never block on Elasticsearch

When a document changes, enqueue an indexing job; do not call the Elasticsearch client from the
write path. The web request then never waits on the search cluster, a slow or down cluster cannot
fail a write, and retries are handled by the queue.

**Incorrect (the request waits on Elasticsearch):**

```typescript
// modules/users/services/users.service.ts
async create(input: CreateUserInput): Promise<User> {
  const user = await this.usersRepository.create(input);
  // The request now blocks on the search cluster; if it is slow or down, this throws.
  // (A service cannot inject the client at all — the engine stays behind the seam — which is the
  // other reason the write path must enqueue instead; see cfg-search-backend-seam.)
  await this.es.index({ index: 'users', id: user._id.toString(), document: toDoc(user) });
  return user;
}
```

Why it is wrong: the write succeeds in MongoDB but the request fails if Elasticsearch is
unavailable, and the user's latency now includes the search cluster's.

**Correct (enqueue and return; the pipeline indexes):**

```typescript
// modules/users/search/users.search-indexer.ts
@Injectable()
export class UsersSearchIndexer {
  constructor(private readonly usersSearch: UsersSearchRepository) {}

  @OnEvent('user.created')
  @OnEvent('user.updated')
  async onChanged(e: { id: string }): Promise<void> {
    await this.usersSearch.enqueueIndex(e.id); // one line, no client call
  }
}

// modules/users/services/users.service.ts — emits, never indexes
async create(input: CreateUserInput): Promise<User> {
  const user = await this.usersRepository.create(input);
  this.events.emit('user.created', { id: user._id.toString() });
  return user;
}
```

Why it is right: the write path only emits, the queue owns delivery and retries, and Elasticsearch
being down degrades only search freshness, never writes.

`enqueueIndex` is defined once on the base `SearchRepository` (see `arch-base-search-repository`),
so a feature never touches the queue or the client directly.

Reference: [NestJS Queues](https://docs.nestjs.com/techniques/queues) | [NestJS Events](https://docs.nestjs.com/techniques/events)
