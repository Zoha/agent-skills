---
title: Put Shared Index and Query Logic in a Base Repository
impact: HIGH
impactDescription: "features add ~2 files, not a full pipeline"
tags: architecture, repositories, abstraction, base-class
---

## Put Shared Index and Query Logic in a Base Repository

**Impact: HIGH** — features add ~2 files, not a full pipeline

Everything generic about indexing and querying lives once, in an abstract
`SearchRepository` in `common/search/`: enqueueing, debouncing, deletes, bulk indexing, the
ID-only search, and the full-reindex loop. A feature subclasses it and implements only the
two things that are actually feature-specific — the batch mapper and the query.

**Incorrect (every feature re-implements the pipeline):**

```typescript
// modules/users/search/users.search-repository.ts
@Injectable()
export class UsersSearchRepository {
  async index(id: string) { /* users-specific queue wiring */ }
  async bulk(ids: string[]) { /* users-specific _bulk */ }
  async search(term: string) { /* users-specific _source:false search */ }
}

// modules/posts/search/posts.search-repository.ts — the same pipeline, copied
@Injectable()
export class PostsSearchRepository {
  async index(id: string) { /* posts-specific queue wiring */ }
  async bulk(ids: string[]) { /* posts-specific _bulk */ }
  async search(term: string) { /* posts-specific _source:false search */ }
}
```

Why it is wrong: the queue wiring, bulk shape, and ID-only search are duplicated per feature, so a
fix to one does not reach the others and each feature can drift.

**Correct (one base owns the pipeline; a feature supplies only its mapper and query):**

```typescript
// common/search/search.repository.ts — the shared pipeline
export abstract class SearchRepository<Doc extends { id: string }> {
  abstract readonly index: string; // the alias

  constructor(
    protected readonly es: ElasticsearchService,
    @InjectQueue('search-reindex') protected readonly queue: Queue,
  ) {}

  async enqueueIndex(id: string): Promise<void> { /* jobId dedupe + delay */ }
  async enqueueMany(ids: string[]): Promise<void> { /* one batched job */ }
  async deleteOne(id: string): Promise<void> { /* immediate delete */ }
  async bulkIndex(docs: Doc[]): Promise<void> { /* one _bulk */ }
  async searchIds(query: object, sort: object[], limit = 20, cursor?: string) { /* _source:false */ }

  abstract loadByIds(ids: string[]): Promise<Doc[]>;
  abstract loadBatch(cursor?: string, size?: number): Promise<{ docs: Doc[]; nextCursor?: string }>;
}

// modules/users/search/users.search-repository.ts — only what is users-specific
@Injectable()
export class UsersSearchRepository extends SearchRepository<UserSearchDocument> {
  readonly index = 'users';

  async loadByIds(ids: string[]): Promise<UserSearchDocument[]> {
    return this.toDocuments(await this.users.findByIds(ids));
  }

  async loadBatch(cursor?: string, size = 500) {
    const page = await this.users.pageCursor(cursor, size);
    return { docs: await this.toDocuments(page.items), nextCursor: page.nextCursor };
  }

  private async toDocuments(users: UserDocument[]): Promise<UserSearchDocument[]> { /* ... */ }
}
```

Why it is right: the pipeline exists once, the shared processor can drive any feature through the
base contract, and a feature is a mapper plus a query.

Reference: [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) | [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)
