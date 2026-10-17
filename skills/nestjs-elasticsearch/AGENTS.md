# NestJS Elasticsearch

**Version 1.1.2**
NestJS Elasticsearch
October 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

Integration guide for adding Elasticsearch-backed search to a NestJS GraphQL + MongoDB application, designed for AI agents and LLMs. Establishes the architectural boundary — a generic infra client, a shared search layer, and one index per feature owned by the feature module — then gives rules for the whole lifecycle: a typed search document that mirrors only the searchable subset of an entity, a mapping declared as a typed object, incremental indexing enqueued onto a shared BullMQ pipeline with same-id debouncing, immediate deletes, batched bulk indexing, versioned indices with atomic alias swaps, and idempotent index creation that is safe across concurrent instances, including a boot-time guard that fills an empty index without blocking startup. Query rules keep Elasticsearch a pure finder: searches return IDs only (`_source: false`), the result set is hydrated from MongoDB and reordered to the relevance ordering, and deep pagination uses `search_after` with a unique sort tiebreaker. Cross-entity rules keep derived values (visit counts, comment counts) cached on the owning document and indexed by the module that owns them, so a contributing module never learns about another module's index. Configuration rules make search optional and pluggable: one backend seam selects Elasticsearch or a deterministic MongoDB fallback, so the application boots, serves, and is tested without a cluster. Operations rules cover request/response logging, an explain hook, migration and reindex CLI commands, health checks, and why indexing never uses an in-process timer. Testing rules keep unit tests on a mocked seam and reserve a real, throwaway Elasticsearch for analyzer, DSL, and pagination semantics.

---

## Table of Contents

1. [Architecture](#1-architecture) — **CRITICAL**
   - 1.1 [Put Shared Index and Query Logic in a Base Repository](#11-put-shared-index-and-query-logic-in-a-base-repository)
   - 1.2 [Keep Elasticsearch Fields Out of the Entity](#12-keep-elasticsearch-fields-out-of-the-entity)
   - 1.3 [Let Each Feature Own and Register Its Index](#13-let-each-feature-own-and-register-its-index)
   - 1.4 [Isolate the Elasticsearch Client in a Generic Infra Module](#14-isolate-the-elasticsearch-client-in-a-generic-infra-module)
2. [Indexing & Sync](#2-indexing--sync) — **CRITICAL**
   - 2.1 [Index in Batches with the Bulk API](#21-index-in-batches-with-the-bulk-api)
   - 2.2 [Debounce Same-Id Bursts](#22-debounce-same-id-bursts)
   - 2.3 [Delete from the Index Immediately](#23-delete-from-the-index-immediately)
   - 2.4 [Enqueue Indexing; Never Write to Elasticsearch Inline](#24-enqueue-indexing-never-write-to-elasticsearch-inline)
   - 2.5 [Reindex Through a Versioned Index and Swap the Alias](#25-reindex-through-a-versioned-index-and-swap-the-alias)
   - 2.6 [Create Indices Idempotently with Deterministic Names](#26-create-indices-idempotently-with-deterministic-names)
3. [Schema & Mapping](#3-schema--mapping) — **HIGH**
   - 3.1 [Choose Text Analyzers Deliberately](#31-choose-text-analyzers-deliberately)
   - 3.2 [Compute Derived and Relation Fields in a Batch Mapper](#32-compute-derived-and-relation-fields-in-a-batch-mapper)
   - 3.3 [Index Only Fields With a Search Purpose](#33-index-only-fields-with-a-search-purpose)
   - 3.4 [Declare the Mapping as a Typed Object](#34-declare-the-mapping-as-a-typed-object)
   - 3.5 [Type the Search Document Against the Entity](#35-type-the-search-document-against-the-entity)
4. [Querying](#4-querying) — **HIGH**
   - 4.1 [Paginate with search_after](#41-paginate-with-search_after)
   - 4.2 [Hydrate from MongoDB and Restore Relevance Order](#42-hydrate-from-mongodb-and-restore-relevance-order)
   - 4.3 [Search Returns IDs Only](#43-search-returns-ids-only)
   - 4.4 [Always Include a Unique Sort Tiebreaker](#44-always-include-a-unique-sort-tiebreaker)
5. [Cross-Entity](#5-cross-entity) — **MEDIUM-HIGH**
   - 5.1 [Cache Derived Counters on the Owning Document](#51-cache-derived-counters-on-the-owning-document)
   - 5.2 [The Owning Module Subscribes; Others Emit Their Own Events](#52-the-owning-module-subscribes-others-emit-their-own-events)
6. [Operations & DX](#6-operations--dx) — **MEDIUM**
   - 6.1 [Provide Migration and Reindex CLI Commands](#61-provide-migration-and-reindex-cli-commands)
   - 6.2 [Provide an Explain Hook](#62-provide-an-explain-hook)
   - 6.3 [Include Elasticsearch in Health Checks](#63-include-elasticsearch-in-health-checks)
   - 6.4 [Log Elasticsearch Requests and Responses](#64-log-elasticsearch-requests-and-responses)
   - 6.5 [Never Schedule Indexing with an In-Process Timer](#65-never-schedule-indexing-with-an-in-process-timer)
7. [Configuration & Environments](#7-configuration--environments) — **HIGH**
   - 7.1 [Fall Back to a Deterministic MongoDB Finder](#71-fall-back-to-a-deterministic-mongodb-finder)
   - 7.2 [Put Search Behind a Backend Seam](#72-put-search-behind-a-backend-seam)
8. [Testing](#8-testing) — **MEDIUM-HIGH**
   - 8.1 [Mock the Search Backend Seam in Unit Tests](#81-mock-the-search-backend-seam-in-unit-tests)
   - 8.2 [Test Query Semantics Against a Real Elasticsearch](#82-test-query-semantics-against-a-real-elasticsearch)

---

## 1. Architecture

**Section Impact: CRITICAL**

### 1.1 Put Shared Index and Query Logic in a Base Repository

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
// common/search/search.repository.ts — the shared pipeline.
// @Injectable() is required on the base: a subclass that declares no constructor inherits these
// parameter types, and a subclass that adds its own constructor MUST call super(...)
@Injectable()
export abstract class SearchRepository<Doc extends { id: string }> {
  abstract readonly index: string; // the alias — sent with every backend call (the backend is app-wide)

  constructor(
    @Inject(SEARCH_BACKEND) protected readonly backend: SearchBackend, // the seam, not the client
    @InjectQueue('search-reindex') protected readonly queue: Queue,
  ) {}

  async enqueueIndex(id: string): Promise<void> { /* jobId dedupe + delay */ }
  async enqueueMany(ids: string[]): Promise<void> { /* one batched job */ }
  async deleteOne(id: string): Promise<void> { /* delegates an immediate delete to the backend */ }
  async bulkIndex(docs: Doc[], index?: string): Promise<void> { /* delegates one batched write to the backend */ }
  async searchIds(query: object, sort: object[], limit = 20, cursor?: string) { /* backend.searchIds({ alias: this.index, ... }); _source:false */ }

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

The base depends on the `SearchBackend` interface, not the Elasticsearch client, so the shared layer
stays engine-agnostic and a test can inject a fake with no cluster running (see
`cfg-search-backend-seam`).

`bulkIndex` takes an optional target index because a versioned reindex must fill the **new** index,
never the alias the cluster is still serving — writing to the alias would fill the old index and
then publish an empty one (see `sync-full-reindex-alias-swap`).

**A deliberate exception to the queue-placement rule.** `service-background-jobs` in
`nestjs-graphql-structure` puts processors in the feature that owns the data, and forbids processing
a feature's jobs from an unrelated module. The search pipeline is the exception: it is byte-for-byte
identical for every feature, so it runs once in the shared layer and resolves the owning feature's
repository through the registry instead of importing it. What stays feature-local is the mapper and
the query. The queue itself is registered once, with the other queue connections:

```typescript
// infra/queue/queue.module.ts
@Module({
  imports: [BullModule.registerQueue({ name: 'search-reindex' })],
  exports: [BullModule],
})
export class QueueModule {}
```

The registry is what makes the exception safe: a processor never names a feature, and a feature never
names another feature's index.

Reference: [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) | [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)

---

### 1.2 Keep Elasticsearch Fields Out of the Entity

**Impact: CRITICAL** — the entity stays Mongo/GraphQL only; ES has its own type

Elasticsearch needs fields that exist in neither MongoDB nor the GraphQL schema — a denormalized
relation name, an autocomplete field, a computed count. Do not add them to the entity. Give the
feature a dedicated **search document**: a separate type holding only the fields Elasticsearch
cares about.

**Incorrect (ES-only fields added to the entity):**

```typescript
// modules/users/entities/user.entity.ts
@ObjectType()
@Schema({ collection: 'users' })
export class User {
  @Field() @Prop() name: string;
  @Prop({ select: false }) passwordHash: string;

  @Field({ nullable: true })
  authorName?: string;   // never stored in Mongo, never used in GraphQL

  @Field({ nullable: true })
  suggest?: string;      // an ES completion field living on the entity
}
```

Why it is wrong: the entity now carries fields that exist for neither storage nor the API, Mongoose
and GraphQL both see them, and the entity's single responsibility is broken.

**Correct (a dedicated search document; the entity is untouched):**

```typescript
// modules/users/search/users.search-document.ts — the ES projection
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>          // mirrors, from the entity
  & { id: string; authorName: string; likeCount: number };     // derived, Elasticsearch-only

// modules/users/entities/user.entity.ts — unchanged, Mongo/GraphQL only
@ObjectType()
@Schema({ collection: 'users' })
export class User {
  @Field() @Prop({ required: true }) name: string;
  @Field() @Prop({ required: true, unique: true, index: true }) email: string;
  @Prop({ required: true, select: false }) passwordHash: string;
}
```

Why it is right: the search document holds only the Elasticsearch projection, the entity keeps its
single responsibility, and ES-only fields have one home.

The `Pick<UserDocument, ...>` half ties the search document to the entity: renaming a mirrored
field on the entity is then a compile error in the projection (see `map-typed-search-document`).

See `data-models-mappers` in the `nestjs-graphql-structure` skill for where the search document sits
in a feature's file layout.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)

---

### 1.3 Let Each Feature Own and Register Its Index

**Impact: CRITICAL** — no central index list; infra never imports a feature

Each feature defines its own index (alias, version, mapping) in its own `search/` folder and
registers it from its own module. A single shared registry collects the definitions, so
`AppModule` and the infra layer never list features. The dependency direction is always
feature → shared search layer → infra.

**Incorrect (a central index list inside infra, or AppModule naming features):**

```typescript
// infra/elasticsearch/indexes.ts — infra knows every feature
export const INDEXES = [USERS_INDEX, POSTS_INDEX, COMMENTS_INDEX]; // infra -> features

// app.module.ts — the composition root names feature indices
@Module({ imports: [SearchModule.forFeature([USERS_INDEX, POSTS_INDEX])] })
export class AppModule {}
```

Why it is wrong: the infra layer (or the composition root) depends on every feature, so adding a
feature edits a shared file and the boundary is lost.

**Correct (feature-owned definition, self-registration):**

```typescript
// modules/users/search/users.index.ts — owned by the feature
export const USERS_INDEX: SearchIndexDef<UserSearchDocument> = {
  alias: 'users',
  version: 'users_v1',
  mapping: USER_SEARCH_MAPPING,
};

// modules/users/search/users.search-registration.ts — the feature registers itself
@Injectable()
export class UsersSearchIndexRegistration implements OnModuleInit {
  constructor(
    private readonly registry: SearchIndexRegistry,
    private readonly es: ElasticsearchService,
    private readonly repo: UsersSearchRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registry.register(USERS_INDEX, this.repo, User.name); // alias -> { repository, model }
    await this.registry.ensure(this.es, USERS_INDEX); // idempotent create
  }
}

// modules/users/users.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]), SearchModule],
  providers: [UsersService, UsersSearchRepository, UsersSearchIndexRegistration],
  exports: [UsersService],
})
export class UsersModule {}

// app.module.ts — imports modules, never names an index
@Module({ imports: [SearchModule, UsersModule, PostsModule] })
export class AppModule {}
```

Why it is right: each feature owns and registers its own index, the registry maps alias →
repository and model for the shared processor, and neither `AppModule` nor infra knows a feature name.

The registry stores `alias -> { definition, repository, model }`, which is what lets the single shared
reindex processor resolve a feature's repository without importing the feature, and what lets the
MongoDB fallback resolve a feature's model by alias (see `cfg-mongo-fallback-backend`).

`register` runs before `ensure` so the shared processor can resolve the alias the moment it starts.
`ensure` is the network call, and it must never abort bootstrap: an unreachable cluster defers to
the next sweep, while a rejected mapping still fails loudly (see `sync-idempotent-index-creation`).

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS Dynamic Modules](https://docs.nestjs.com/fundamentals/dynamic-modules)

---

### 1.4 Isolate the Elasticsearch Client in a Generic Infra Module

**Impact: CRITICAL** — one connection; features stay unaware of the client

The `@nestjs/elasticsearch` client is one-time infrastructure. Configure it once in a generic
`infra/elasticsearch/` module, and **re-export `ElasticsearchModule`** so importing feature
modules can inject the client. The infra module knows nothing about any feature's index.

**Incorrect (each feature configures its own connection):**

```typescript
// modules/users/users.module.ts
@Module({
  imports: [ElasticsearchModule.register({ node: 'http://localhost:9200' })],
  providers: [UsersSearchRepository],
})
export class UsersModule {}

// modules/posts/posts.module.ts
@Module({
  imports: [ElasticsearchModule.register({ node: 'http://localhost:9200' })], // a second client
  providers: [PostsSearchRepository],
})
export class PostsModule {}
```

Why it is wrong: every feature opens its own client and hardcodes the node, so configuration is
duplicated, connections multiply, and changing the cluster means editing every feature.

**Correct (one infra module, re-exported):**

```typescript
// infra/elasticsearch/elasticsearch.module.ts
@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        node: config.get<string>('elasticsearch.node'),
        auth: {
          username: config.get<string>('elasticsearch.username'),
          password: config.get<string>('elasticsearch.password'),
        },
        maxRetries: 5,
        requestTimeout: 30_000,
      }),
    }),
  ],
  exports: [ElasticsearchModule], // REQUIRED: re-export so importers can inject the client
})
export class ElasticsearchInfraModule {}
```

```typescript
// common/search/search.module.ts
@Global()
@Module({
  imports: [ElasticsearchInfraModule],
  providers: [SearchIndexRegistry, SearchReindexEngine],
  exports: [SearchIndexRegistry, SearchReindexEngine],
})
export class SearchModule {}
```

Why it is right: the client is configured once from typed config, re-exported so the shared layer
and features can inject it, and the infra module carries no feature knowledge.

The client is created by `registerAsync` from typed config, never from a literal in a feature.
Re-exporting matters: a module that provides a dynamic module must export that module too, or
importers cannot resolve its providers.

The client is also the single implementation behind the `SearchBackend` seam: the shared layer and
features depend on the interface, and `ElasticsearchService` is injected in exactly one class, the
Elasticsearch backend (see `cfg-search-backend-seam`). Keeping that dependency to one class is what
lets the application boot with no cluster and lets a test inject a fake.

Reference: [nestjs/elasticsearch](https://github.com/nestjs/elasticsearch) | [NestJS Modules](https://docs.nestjs.com/modules)

---

## 2. Indexing & Sync

**Section Impact: CRITICAL**

### 2.1 Index in Batches with the Bulk API

**Impact: HIGH** — one request per batch, not per document

A full or partial reindex touches many documents. Send them through the `_bulk` API in batches and
issue one `refresh` at the end rather than after every write. Never issue one indexing request per
document in a loop.

**Incorrect (a request per document, refreshed every time):**

```typescript
for (const user of users) {
  await this.es.index({ index: 'users', id: user.id, document: toDoc(user), refresh: true });
}
// 10,000 documents -> 10,000 round-trips and 10,000 refreshes
```

Why it is wrong: each document costs a round-trip and each `refresh: true` forces a Lucene segment
refresh, so a large reindex is orders of magnitude slower than it needs to be.

**Correct (one bulk request per batch, one refresh at the end):**

```typescript
// common/search/search.repository.ts (base) — policy only; the engine call is behind the seam
async bulkIndex(docs: Doc[], index: string = this.index): Promise<void> {
  if (!docs.length) return;
  await this.backend.bulkIndex(index, docs); // the ONE _bulk implementation lives in the backend
}

// infra/elasticsearch/elasticsearch.backend.ts — the only place _bulk is issued
async bulkIndex(index: string, docs: unknown[]): Promise<void> {
  const res = await this.es.bulk({
    operations: docs.flatMap((d) => [
      { index: { _index: index, _id: (d as { id: string }).id } }, // the target index, not necessarily the alias
      d,
    ]),
    refresh: false, // never refresh per batch
  });
  this.assertBulkClean(res, docs); // HTTP 200 does not mean every document landed
}

async refresh(index: string): Promise<void> {
  await this.es.indices.refresh({ index }); // one refresh per run, not per batch
}

// a partial bulk is a failed bulk: 429-class failures retry, mapping errors fail the job
private assertBulkClean(res: BulkResponse, docs: unknown[]): void {
  if (!res.errors) return;

  // `items` is in submitted order, so items[i] belongs to docs[i]
  const failed = res.items.flatMap((item, i) => {
    const result = Object.values(item)[0] as { status: number; error?: unknown };
    return result.error ? [{ doc: docs[i], status: result.status, error: result.error }] : [];
  });

  const retryable = failed.filter((f) => [429, 502, 503, 504].includes(f.status));
  const fatal = failed.filter((f) => ![429, 502, 503, 504].includes(f.status));

  // `errors: true` with no item matching the expected shape: fail loudly. Throwing an empty
  // retryable error would make the queue retry forever with no progress.
  if (!failed.length) throw new Error('bulk reported errors with no per-item error');

  // both are plain Error subclasses the queue treats as retryable and non-retryable
  if (fatal.length) throw new BulkIndexError(fatal); // will fail again on every retry
  throw new RetryableBulkError(retryable);           // let the queue retry with backoff
}

// common/search/search-reindex.engine.ts — refresh once, after the loop
let cursor: string | undefined;
for (;;) {
  const page = await repo.loadBatch(cursor, 500);
  if (!page.docs.length) break;
  await repo.bulkIndex(page.docs, target); // fill the NEW index, not the live alias
  cursor = page.nextCursor;
  if (!cursor) break;
}
await this.backend.refresh(target); // one refresh for the whole run, through the seam
```

Why it is right: documents travel in batches, `refresh: false` avoids a segment refresh per batch,
and a single refresh at the end makes the whole index visible at once.

A bulk request answers HTTP 200 even when individual operations fail: the response carries
`errors: true` and a per-item `error`, so a reindex can look successful while documents are missing
from the index. `assertBulkClean` reads that response, retries 429-class backpressure and fails the
job on a mapping error, so a partial index is never mistaken for a complete one.

The `operations` array alternates an action line and a document line; a single `bulkIndex` covers
both full and incremental paths, so there is one bulk implementation in the codebase.

Reference: [Elasticsearch — Bulk API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-bulk)

---

### 2.2 Debounce Same-Id Bursts

**Impact: CRITICAL** — 1,000 changes to one doc -> 1 index job

A hot document — a post accruing views, a counter incremented in a loop — can emit hundreds of
"changed" events per second. Enqueue with a stable `jobId` and a short `delay` so duplicates
collapse into one job per id per window, and an idle system schedules nothing.

**Incorrect (one job per event):**

```typescript
// 1,000 events on the same post -> 1,000 jobs -> 1,000 index operations
@OnEvent('post.viewed')
async onViewed(e: { id: string }): Promise<void> {
  await this.queue.add('index-one', { alias: 'posts', id: e.id });
}
```

Why it is wrong: the same document is fetched and re-indexed a thousand times in a second, wasting
Elasticsearch capacity on a burst that changes nothing after the first write.

**Correct (dedupe by id, debounce with a delay):**

```typescript
// common/search/search.repository.ts (base)
async enqueueIndex(id: string): Promise<void> {
  await this.queue.add('index-one', { alias: this.index, id }, {
    jobId: `${this.index}:${id}`,  // same-id duplicates while pending are ignored
    delay: 500,                     // debounce window (use 120_000 for a longer quiet period)
    removeOnComplete: true,
    removeOnFail: true,
  });
}
```

Why it is right: `jobId` collapses same-id bursts into a single pending job, the delay widens the
window, and `removeOnComplete` frees the id so the next window can schedule again.

The longer quiet period (mean "wait until the document has been stable for N minutes") is the same
call with a larger `delay` — for example `delay: 120_000` for two minutes. When many *distinct* ids
change at once, prefer one batched job (`enqueueMany`) over per-id jobs; see `sync-bulk-index`.

Reference: [BullMQ — Job ids and deduplication](https://docs.bullmq.io/guide/jobs/job-ids)

---

### 2.3 Delete from the Index Immediately

**Impact: MEDIUM-HIGH** — deleted documents stop appearing in search at once

Deletes do not need debouncing — there is nothing to coalesce, and a stale hit is worse than a
missing one. Delete from the index immediately, and ignore the not-found case so a repeated delete
is harmless. Handle the delete-missing-in-Mongo case in the incremental indexer by deleting instead
of indexing.

**Incorrect (deletes share the debounced path, or are omitted):**

```typescript
@OnEvent('user.deleted')
async onDeleted(e: { id: string }): Promise<void> {
  await this.usersSearch.enqueueIndex(e.id); // wrong: indexes a document that is gone
}

// or: nothing at all — the document lingers in Elasticsearch and keeps matching
```

Why it is wrong: re-enqueuing on delete either resurrects the document (if the loader still finds
it) or leaves a dangling hit that surfaces in results.

**Correct (immediate delete, 404 ignored; indexer deletes when the source is gone):**

```typescript
// common/search/search.repository.ts (base) — policy only
async deleteOne(id: string): Promise<void> {
  await this.backend.deleteOne(this.index, id); // the engine owns the refresh and the 404 handling
}

// infra/elasticsearch/elasticsearch.backend.ts
async deleteOne(index: string, id: string): Promise<void> {
  // deletes are low-frequency, so refresh here: a stale hit is worse than a missing one.
  // This is the deliberate exception to "never refresh per batch" (see sync-bulk-index).
  await this.es.delete({ index, id }, { ignore: [404], refresh: true }); // idempotent
}

// modules/users/search/users.search-indexer.ts
@OnEvent('user.deleted')
async onDeleted(e: { id: string }): Promise<void> {
  await this.usersSearch.deleteOne(e.id); // no debounce
}

// common/search/search-reindex.processor.ts — the incremental path handles a missing source
@Process('index-one')
async indexOne(job: Job<{ alias: string; id: string }>): Promise<void> {
  const repo = this.registry.repository(job.data.alias);
  const docs = await repo.loadByIds([job.data.id]);
  if (!docs.length) return repo.deleteOne(job.data.id); // deleted between enqueue and run
  await repo.bulkIndex(docs);
}
```

Why it is right: `refresh: true` makes the delete visible at once, `ignore: [404]` makes it
idempotent, and the incremental processor deletes when the source document has since disappeared.

The refresh is deliberate and local to deletes. Without it the document stays searchable until the
next index refresh — about a second by default — so "immediately" would really mean "within the
refresh interval". Deletes are low-frequency, so one refresh per delete is cheap; a batch index is
the opposite case, where `refresh: false` is what keeps a reindex fast (see `sync-bulk-index`).

A soft-delete design (a `deletedAt` field) instead indexes the document normally and filters
deleted documents at query time; pick one approach per feature and apply it consistently.

Reference: [Elasticsearch — Delete API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-delete)

---

### 2.4 Enqueue Indexing; Never Write to Elasticsearch Inline

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

---

### 2.5 Reindex Through a Versioned Index and Swap the Alias

**Impact: CRITICAL** — mapping changes ship with zero downtime

Some mapping changes cannot be applied in place (a changed field type or analyzer), and an
additive field is not searchable on existing documents until they are reindexed. Never rebuild the
live index in place. Create a new versioned index, fill it in the background, then swap the alias
in one atomic call. The version string is a code constant you bump by hand, like a migration.

**Incorrect (deleting or rewriting the live index):**

```typescript
await this.es.indices.delete({ index: 'users' });      // search is down while it rebuilds
await this.es.indices.create({ index: 'users', mappings: newMapping });
await reindex();                                         // clients see empty results meanwhile
```

Why it is wrong: there is a window with no index (or a half-filled one), so queries fail or return
nothing during the rebuild.

**Correct (versioned index, atomic alias swap after a clean reindex):**

```typescript
// modules/users/search/users.index.ts
export const USERS_INDEX = { alias: 'users', version: 'users_v1', mapping: USER_SEARCH_MAPPING } as const;
// bump version -> 'users_v2' when the mapping changes

// common/search/search-reindex.engine.ts — fill the new index, then swap after a clean loop
let cursor: string | undefined;
for (;;) {
  const page = await repo.loadBatch(cursor, 500);
  if (!page.docs.length) break;
  await repo.bulkIndex(page.docs, target); // the versioned index, NOT the live alias
  cursor = page.nextCursor;
  if (!cursor) break;                      // last page
}
await this.backend.refresh(target);        // one refresh for the whole run, through the seam
await this.swapAlias(alias, target);       // reached only when every batch was clean

// infra/elasticsearch/alias.ts — the one place an alias is mutated
export async function pointAliasAt(
  es: ElasticsearchService,
  alias: string,
  target: string,
): Promise<void> {
  const current = await es.indices.getAlias({ name: alias }, { ignore: [404] });
  const holders = Object.keys(current?.body ?? {});
  if (holders.length === 1 && holders[0] === target) return;

  await es.indices.updateAliases({
    actions: [
      ...holders.filter((i) => i !== target).map((index) => ({ remove: { index, alias } })),
      { add: { index: target, alias } },   // one atomic call: never a gap
    ],
  });
}

// the engine delegates: private swapAlias = (alias, target) => pointAliasAt(this.es, alias, target)
```

Why it is right: the new index is filled completely before the alias points at it, the swap is a
single atomic cluster-state update, and if the reindex throws the alias still points at the old
index, so search keeps working.

The loop writes to `target`, not to `this.index`: `this.index` is the alias, which still resolves to
the **old** index while the reindex runs, so writing through it would fill the live index and then
publish an empty new one. `pointAliasAt` is the single alias mutator — `ensureIndex` uses it only
when no version holds the alias yet (see `sync-idempotent-index-creation`), and this rule uses it to
swap.

Three triggers enqueue this job, and all three must use the same stable `jobId` (`reindex:${alias}`)
so a fleet of instances collapses to one run: a boot-time guard that fires **only when the current
index is empty**, the CLI command for a deliberate migration, and a nightly reconcile that repairs
drift. None of them is the incremental catch-up — that is the two-minute sweep in
`ops-no-cron-for-indexing`, which re-reads changed documents and never swaps an alias.

Do not confuse the boot guard with the anti-pattern in `ops-cli-scripts`. The guard reads the live
index and enqueues a job only when there is nothing to lose, so a healthy restart reindexes nothing;
it enqueues and returns, so a slow or down cluster never delays boot; and it never swaps the alias
inline, so the swap still happens on the worker after a clean loop. An unconditional
`onApplicationBootstrap` reindex is the thing to avoid. When the selected backend is not
Elasticsearch, the guard does not run at all (see `cfg-search-backend-seam`).

See `data-repository` in the `nestjs-graphql-structure` skill for the repository boundary the shared
pipeline respects.

Reference: [Elasticsearch — Aliases](https://www.elastic.co/docs/manage-data/data-store/aliases) | [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb)

---

### 2.6 Create Indices Idempotently with Deterministic Names

**Impact: CRITICAL** — concurrent instances converge; boot never crashes

Index creation must be safe to run at every boot, on every instance, at the same time. Give the
index a deterministic name (a fixed version string) and ignore the "already exists" response.
Elasticsearch serialises cluster-state updates on the master, so for the same name exactly one
instance creates it and the rest get `400 resource_already_exists_exception`. A timestamped name
defeats this and produces one index per instance.

**Incorrect (timestamped names, or unhandled errors on boot):**

```typescript
const name = `users_${Date.now()}`;   // two instances -> two different indices
await this.es.indices.create({ index: name }); // throws on the second instance, crashing boot

// and on a version bump, adding without removing leaves the alias on both versions
await this.es.indices.updateAliases({
  actions: [{ add: { index: 'users_v2', alias: 'users' } }], // alias spans users_v1 + users_v2
});
```

Why it is wrong: a non-deterministic name makes the creation non-idempotent — each instance creates
its own index — and an unhandled create error fails application startup. An alias that spans two
versions returns each document once per index and still matches fields the new mapping dropped.

**Correct (deterministic name, idempotent create, ignored conflicts):**

```typescript
// infra/elasticsearch/ensure-index.ts
const MAPPING_ERRORS = ['illegal_argument_exception', 'mapper_parsing_exception'];

function errorType(err: unknown): string | undefined {
  return (err as { meta?: { body?: { error?: { type?: string } } } })?.meta?.body?.error?.type;
}

export async function ensureIndex(es: ElasticsearchService, def: SearchIndexDef<unknown>): Promise<void> {
  try {
    await createIndexIfAbsent(es, def);
    await addAliasIfUnclaimed(es, def.alias, def.version);
  } catch (err) {
    if (MAPPING_ERRORS.includes(errorType(err) ?? '')) throw err; // broken mapping = broken deploy
    logger.warn('search index ensure deferred', { alias: def.alias, err }); // cluster down: survive
  }
}

// swallow ONLY the already-exists 400: a bad mapping or index name is also a 400
async function createIndexIfAbsent(es: ElasticsearchService, def: SearchIndexDef<unknown>): Promise<void> {
  try {
    await es.indices.create({ index: def.version, mappings: { properties: def.mapping } });
  } catch (err) {
    if (errorType(err) === 'resource_already_exists_exception') return; // lost the race -> fine
    throw err;
  }
}

// claim the alias only when nobody holds it, so a version bump never spans two indices
async function addAliasIfUnclaimed(es: ElasticsearchService, alias: string, target: string): Promise<void> {
  const current = await es.indices.getAlias({ name: alias }, { ignore: [404] });
  if (Object.keys(current?.body ?? {}).length === 0) {
    await es.indices.updateAliases({ actions: [{ add: { index: target, alias } }] });
  }
  // a different version holds the alias: the deliberate search:migrate owns that swap
}
```

Why it is right: with a fixed name (`users_v1`) exactly one concurrent create wins, the losers match
`resource_already_exists_exception` and continue, and every instance boots without crashing on the
same index.

Three details make that safe. The "already exists" case is identified by the error **type**, not by
the status code: a malformed mapping or an illegal index name is also a `400`, and swallowing those
hides a broken deploy. The alias is claimed only when **nobody** holds it — adding `users_v2` to an
alias that already serves `users_v1` puts two indices behind one alias, so every search returns each
document twice and fields the new mapping dropped still match through the old index. And an
unreachable cluster **defers** instead of throwing, so the app still boots and serves writes; the
next sweep retries the ensure.

The same property answers "the app booted but migrations were not run": creation happens on boot
regardless, so the app works with an empty index and returns no results until a reindex job fills
it — it never crashes because a migration step was skipped. A boot-time guard can close that gap by
enqueuing a fill **only when the index is empty**, so a normal restart does nothing (see
`sync-full-reindex-alias-swap`). Only when the **mapping changes** do you bump the version and run a
deliberate reindex.

This is also why the guard is skipped, not faked, when search is configured off: with a
non-Elasticsearch backend there is no index to ensure and no cluster to ping, so `ensureIndex` is a
no-op and no index is created (see `cfg-search-backend-seam`).

Reference: [Elasticsearch — Create index API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-create)

---

## 3. Schema & Mapping

**Section Impact: HIGH**

### 3.1 Choose Text Analyzers Deliberately

**Impact: MEDIUM-HIGH** — search matches what users expect

A `text` field is analyzed: its value is broken into tokens before indexing, and the query is
analyzed the same way. The default `standard` analyzer lowercases and splits on word boundaries,
which is right for prose but wrong for identifiers, codes, or case-sensitive values. For those, use
`keyword` or a custom analyzer. Analyzer choice is part of the mapping and cannot be changed in place
on existing documents.

**Incorrect (an identifier analyzed as prose):**

```typescript
export const USER_SEARCH_MAPPING = {
  email:   { type: 'text' },              // "john@example.com" is tokenized into john, example, com
  orderId: { type: 'text' },              // "AB-1234" tokenized into ab, 1234
  name:    { type: 'text' },              // fine
} satisfies SearchMapping<UserSearchDocument>;
```

Why it is wrong: an exact-match or sort field analyzed as `text` no longer matches the whole value
and cannot be sorted, so filtering by email or order id behaves incorrectly.

**Correct (text for prose, keyword for exact values, custom analyzer when needed):**

```typescript
export const USER_SEARCH_MAPPING = {
  // full-text: analyzed, good for users typing partial words
  name: { type: 'text' },

  // exact match / sort / facet: not analyzed
  email:   { type: 'keyword' },
  orderId: { type: 'keyword' },

  // full-text that also needs an exact sub-field for sorting
  bio: {
    type: 'text',
    fields: { keyword: { type: 'keyword', ignore_above: 256 } }, // sort/filter on bio.keyword
  },
} satisfies SearchMapping<UserSearchDocument>;
```

Why it is right: prose fields are analyzed for partial-word matching, identifier fields match and
sort exactly, and a field that needs both carries an explicit `.keyword` sub-field.

An analyzer cannot be changed on an existing field; doing so requires a new index and a reindex
(see `sync-full-reindex-alias-swap`). A malformed or unexpected analyzer is discoverable with the
`_analyze` API against the live index, which the CLI wrapper exposes (see `ops-cli-scripts`).

Reference: [Elasticsearch — Analyzers](https://www.elastic.co/docs/manage-data/data-store/text-analysis) | [Elasticsearch — Keyword type](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/keyword)

---

### 3.2 Compute Derived and Relation Fields in a Batch Mapper

**Impact: HIGH** — 3 queries per 500 documents, never N+1

Derived fields (a count, a rating) and relation fields (an author's name) are computed when a
document is mapped for indexing, not read from the entity. Compute them **in batch** for the whole
page — one aggregate or one lookup for the batch — and reuse the same domain logic the GraphQL
resolvers use, so there is a single source of truth.

**Incorrect (a query per document inside the mapper):**

```typescript
private async toDocuments(posts: PostDocument[]): Promise<PostSearchDocument[]> {
  return Promise.all(posts.map(async (p) => ({
    id: p._id.toString(),
    title: p.title,
    authorName: (await this.authors.findById(p.authorId)).name,       // query per post
    likeCount: await this.likes.countFor(p._id),                        // query per post
  })));
}
```

Why it is wrong: reindexing 10,000 posts issues 20,000 queries, so the reindex is dominated by
round-trips and can saturate the database.

**Correct (batch the derived data for the whole page):**

```typescript
private async toDocuments(posts: PostDocument[]): Promise<PostSearchDocument[]> {
  const ids = posts.map((p) => p._id.toString());

  const [likes, authors] = await Promise.all([
    this.likes.countForMany(ids),                 // one aggregate for the batch
    this.authors.namesFor(posts.map((p) => p.authorId)), // one query for the batch
  ]);

  return posts.map((p) => ({
    id: p._id.toString(),
    title: p.title,
    authorName: authors.get(p.authorId.toString()) ?? '',
    likeCount: likes.get(p._id.toString()) ?? 0,
  }));
}
```

Why it is right: each batch of 500 documents costs a fixed three queries, and the derived values
come from the same domain services the GraphQL field resolvers use, so they cannot disagree.

The batch mapper is the only mapper. The incremental path (`loadByIds`) and the full path
(`loadBatch`) both call `toDocuments`, so there is one place derived fields are produced. A count
that is read constantly is cached on the owning document instead of recomputed — see
`rel-derived-counter-cache`.

See `relations-dataloader` in the `nestjs-graphql-structure` skill for the per-request batching
pattern this batch mapper mirrors.

Reference: [DataLoader](https://github.com/graphql/dataloader) | [MongoDB — Aggregation](https://www.mongodb.com/docs/manual/aggregation/)

---

### 3.3 Index Only Fields With a Search Purpose

**Impact: HIGH** — smaller, faster, safer index

The search document is a projection: it contains exactly the fields Elasticsearch searches, sorts,
filters, or aggregates on — nothing more. Secrets, large blobs, and fields with no search purpose
are simply absent. Since searches return IDs only, Elasticsearch never needs to hold the full
document.

**Incorrect (the whole entity is mirrored into the index):**

```typescript
// every field is indexed, including ones with no search use and ones that must not leave Mongo
export type UserSearchDocument = UserDocument;

const toDoc = (u: UserDocument) => ({ ...u.toObject() }); // passwordHash, resetToken, bio, avatar bytes
```

Why it is wrong: the index carries secrets and dead weight, costs more to store and search, and a
later `_source` read would leak fields that should never leave MongoDB.

**Correct (only search-relevant fields are present):**

```typescript
// modules/users/search/users.search-document.ts
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>   // searched / sorted / filtered
  & { id: string; likeCount: number };

// mapper includes only those fields — nothing else
const toDoc = (u: UserDocument, stats: { likeCount: number }): UserSearchDocument => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  createdAt: u.createdAt,
  likeCount: stats.likeCount,
});
```

Why it is right: only fields with a query purpose are indexed, `passwordHash` and free-text `bio`
never enter Elasticsearch, and the index stays small.

The default is exclusion: a field earns its place in the mapping by being used in a query, sort, or
filter. Because queries return `_source: false` (see `query-ids-only-search`), a field that is never
queried has no reason to be indexed at all.

Reference: [Elasticsearch — Mapping and field types](https://www.elastic.co/docs/manage-data/data-store/mapping)

---

### 3.4 Declare the Mapping as a Typed Object

**Impact: HIGH** — one source of truth for the index shape

Declare the index mapping as a plain object, typed against the search document with `satisfies`.
This keeps the mapping, the document, and the mapper in agreement, and it is the one place the
index shape is defined. Do not scatter mapping metadata across decorators on the entity, and do not
hand-write the mapping in a separate file from the document it describes.

**Incorrect (mapping lives apart from the document, in untyped JSON):**

```typescript
// infra/elasticsearch/mappings.ts — a hand-written mapping on the other side of the app
export const mappings = {
  users: { properties: { name: { typ: 'text' }, email: { type: 'keyword' } } }, // typo: 'typ'
};
```

Why it is wrong: the mapping is untyped and lives away from the document it must match, so a typo
or a renamed field is caught only at index time, if at all.

**Correct (mapping typed against the document, beside it):**

```typescript
// modules/users/search/users.search-document.ts
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>
  & { id: string; authorName: string; likeCount: number };

export const USER_SEARCH_MAPPING = {
  id:         { type: 'keyword' },
  name:       { type: 'text' },
  email:      { type: 'keyword' },
  createdAt:  { type: 'date' },
  authorName: { type: 'text' },
  likeCount:  { type: 'integer' },
} satisfies SearchMapping<UserSearchDocument>;

// the index definition carries document + mapping together
export const USERS_INDEX: SearchIndexDef<UserSearchDocument> = {
  alias: 'users',
  version: 'users_v1',
  mapping: USER_SEARCH_MAPPING,
};
```

Why it is right: the mapping and the document are one unit, `satisfies` checks the mapping's keys
against the document, and changing the shape is a single, reviewable edit.

A `keyword` field is exact-match, aggregatable, and sortable; a `text` field is analyzed for
full-text search. Mirror a text field with a `.keyword` sub-field only when you also need to sort
or filter on it — see `map-analyzers`.

Reference: [Elasticsearch — Mapping](https://www.elastic.co/docs/manage-data/data-store/mapping)

---

### 3.5 Type the Search Document Against the Entity

**Impact: HIGH** — renaming an entity field breaks the build, not search

The search document mirrors a subset of the entity plus its derived fields. Tie that subset to the
entity with a `Pick<Entity, ...>` so a renamed or removed field is a compile error, not a silently
empty index field. List only the searchable fields — this is a projection, not a copy of the schema.

**Incorrect (an untyped bag of fields that drifts unnoticed):**

```typescript
// modules/users/search/users.search-document.ts
export interface UserSearchDocument {
  name: string;
  emailAddres: string;   // typo / renamed on the entity -> always undefined at index time
  authrName: string;
  [key: string]: unknown; // no relationship to the entity at all
}
```

Why it is wrong: nothing connects the document to the entity, so a renamed field silently stops
being indexed and search quietly degrades.

**Correct (mirrored fields are picked from the entity; derived fields are explicit):**

```typescript
// modules/users/search/users.search-document.ts
export type UserSearchDocument =
  Pick<UserDocument, 'name' | 'email' | 'createdAt'>          // mirrors — checked against the entity
  & { id: string; authorName: string; likeCount: number };     // derived — explicit extras

export const USER_SEARCH_MAPPING = {
  id:         { type: 'keyword' },
  name:       { type: 'text' },
  email:      { type: 'keyword' },
  createdAt:  { type: 'date' },
  authorName: { type: 'text' },
  likeCount:  { type: 'integer' },
} satisfies SearchMapping<UserSearchDocument>;
```

Why it is right: renaming `email` on `UserDocument` breaks the `Pick`, the mapping cannot name a
field the type does not declare (`satisfies` enforces it), and only the searchable subset is listed.

Keep the document a projection: it should hold the handful of fields Elasticsearch searches, sorts,
or filters on — never the whole entity. Fields with no search purpose are simply absent (see
`map-exclude-non-search-fields`).

Reference: [TypeScript Pick utility type](https://www.typescriptlang.org/docs/handbook/utility-types.html#picktype-keys) | [TypeScript satisfies operator](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html)

---

## 4. Querying

**Section Impact: HIGH**

### 4.1 Paginate with search_after

**Impact: HIGH** — deep pagination past 10,000 results, consistently

Use `search_after` for cursor pagination. Offset pagination (`from`/`size`) is capped at 10,000
results and gets more expensive as the offset grows, so it is only acceptable for a small, bounded
list. `search_after` walks the sorted result set by carrying the last hit's sort values forward as
an opaque cursor. For a consistent snapshot across a deep traversal, add a point in time (PIT).

**Incorrect (offset pagination that breaks past the cap):**

```typescript
// infra/elasticsearch/elasticsearch.backend.ts — offset pagination (the anti-pattern)
const res = await this.es.search({
  index: 'users',
  from: page * limit,   // from + size must stay under index.max_result_window (10,000)
  size: limit,
  query,
});
// Past 10,000 results Elasticsearch rejects the request.
```

Why it is wrong: it cannot page past 10,000 hits, and each request makes every shard materialise and
sort `from + size` documents, so deep pages get progressively slower.

**Correct (carry sort values forward as a cursor):**

```typescript
// common/search/search.repository.ts (base) — policy only; the engine call is behind the seam.
// The cursor travels in the request and comes back out; the base never names an engine.
async searchIds(term: string | undefined, sort: object[], limit: number, cursor?: string) {
  return this.backend.searchIds({ alias: this.index, term, sort, limit, cursor });
}
```

```typescript
// common/search/search.cursor.ts — opaque cursor over the sort values
export const encodeCursor = (sort: unknown[]) =>
  Buffer.from(JSON.stringify(sort)).toString('base64url');
export const decodeCursor = (cursor: string): unknown[] =>
  JSON.parse(Buffer.from(cursor, 'base64url').toString());
```

Why it is right: the cursor is just the last hit's sort values, so paging is O(page) regardless of
depth and works past 10,000 results.

The `search_after` mechanics live in the Elasticsearch backend, because that is the only layer that
may name the client: it decodes the cursor, passes `search_after`, and encodes the last hit's sort
values back into `nextCursor` (see `query-ids-only-search`). The base repository and every feature
repository only pass the cursor through, so both backends stay interchangeable.

The `query` and `sort` must be identical on every page, and the sort must be deterministic (a unique
tiebreaker) — see `query-sort-tiebreaker`. For a consistent snapshot during a deep traversal, open a
**PIT** and pass `pit: { id, keep_alive }` on each request, carrying the latest `pit_id` forward;
close the PIT when finished. PIT is optional for shallow pages and recommended for exports.

Reference: [Elasticsearch — Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results) | [Elasticsearch — Open point in time](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-open-point-in-time)

---

### 4.2 Hydrate from MongoDB and Restore Relevance Order

**Impact: CRITICAL** — fresh data in relevance order; two queries, one result

A search returns IDs in relevance order. Load those entities from MongoDB in one `$in` query, then
reorder them to the ID order, because MongoDB does not preserve the input order of an `$in`. The
result is fresh data presented in the order Elasticsearch ranked it.

**Incorrect (returning MongoDB's order, or a query per id):**

```typescript
const { ids } = await this.usersSearch.findIds(args);
const users = await this.usersRepository.findByIds(ids);
return users; // MongoDB's order, not the relevance order Elasticsearch computed
```

Why it is wrong: the ranking Elasticsearch produced is discarded, so the most relevant result is no
longer first.

**Correct (one query, then reorder by the returned ID order):**

```typescript
// modules/users/services/users.service.ts
async findMany(args: FindUsersArgs, cursor?: string): Promise<Paginated<User>> {
  const { ids, total, nextCursor } = await this.usersSearch.findIds(args, cursor);
  if (!ids.length) return { nodes: [], total, nextCursor };

  const users = await this.usersRepository.findByIds(ids);          // ONE Mongo query
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const nodes = ids
    .map((id) => byId.get(id))
    .filter((u): u is User => u !== undefined);                     // restore relevance order

  return { nodes, total, nextCursor };
}
```

Why it is right: one MongoDB query fetches every entity, the map restores the relevance order in
memory, and the filter tolerates an id that was deleted between the search and the load.

This two-phase read is the point of the whole design: the search is a ranking over IDs, and the
entities always come from the source of truth. The filter covers the small race where a document is
removed from MongoDB after Elasticsearch matched it. Write it as a type predicate rather than
`.filter(Boolean)`: TypeScript does not narrow `(User | undefined)[]` from a plain boolean test, so
`filter(Boolean)` leaves `nodes` typed as `(User | undefined)[]` and fails to compile under `strict`.

Reference: [MongoDB — Query an Array with $in](https://www.mongodb.com/docs/manual/reference/operator/query/in/)

---

### 4.3 Search Returns IDs Only

**Impact: CRITICAL** — MongoDB stays the only source of returned data

Elasticsearch is a finder, not a store to read from. Every search disables `_source` so the
response carries only the document `_id`s and the sort values needed for the next page. The
entities are then loaded from MongoDB. The index never needs the full document, and results can
never be served with fields that have gone stale.

**Incorrect (the full document is read out of Elasticsearch):**

```typescript
const res = await this.es.search({
  index: 'users',
  query: { multi_match: { query: term, fields: ['name', 'email'] } },
});
return res.hits.hits.map((h) => h._source); // served straight from the index
```

Why it is wrong: the response is the indexed copy, which can lag MongoDB, and every field read from
`_source` must be kept in the index even though it is never used for searching.

**Correct (IDs and sort values only; `_source` disabled):**

```typescript
// infra/elasticsearch/elasticsearch.backend.ts — the Elasticsearch implementation of the seam.
// `req` is a SearchRequest: the alias names the index, because one backend serves every feature.
const { alias, limit, sort, term, cursor } = req;
const query = buildQuery(term);                                  // the engine builds its own DSL
const searchAfter = cursor ? decodeCursor(cursor) : undefined;
const res = await this.es.search({
  index: alias,
  _source: false,                 // no field data in the response
  size: limit,
  query,
  sort,
  ...(searchAfter ? { search_after: searchAfter } : {}),
});

return {
  ids: res.hits.hits.map((h) => h._id),
  total: typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0,
  // "gte" means the count stopped at track_total_hits (10,000 by default) — carry that out,
  // never present a capped count as exact
  totalIsExact: typeof res.hits.total === 'number' || res.hits.total?.relation === 'eq',
  nextCursor: res.hits.hits.length === limit ? encodeCursor(res.hits.hits.at(-1)!.sort!) : null,
};
```

Why it is right: Elasticsearch returns identifiers and ranking order only, so the index is a pure
search structure and MongoDB remains the single source of returned field data.

`_source: false` also means fields that are only ever filtered on (not returned) still earn their
place in the mapping, while fields nobody queries can be dropped entirely (see
`map-exclude-non-search-fields`). The IDs are hydrated in the next step — see
`query-hydrate-restore-order`.

`total` is not always a count. `hits.total` is capped by `track_total_hits` — 10,000 by default —
and reports `relation: "gte"` above the cap, so a naive read shows "10,000 results" for a search that
matched far more. The example carries that relation out as `totalIsExact` instead of dropping it. If
you genuinely need an exact count, set `track_total_hits: true` and accept that counting every hit is
the expensive part of the query.

The contract is the interface, not the engine: `searchIds` returns identifiers plus ordering, and a
non-Elasticsearch backend (see `cfg-mongo-fallback-backend`) returns the same shape, so hydration and
pagination are unchanged whichever backend answers.

Reference: [Elasticsearch — Retrieve selected fields](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/retrieve-selected-fields)

---

### 4.4 Always Include a Unique Sort Tiebreaker

**Impact: HIGH** — no skipped or duplicated results across pages

`search_after` paging is only correct if the sort is total: every document must have a distinct sort
position. A non-unique sort (for example, by `createdAt` alone, where many documents share a
timestamp) lets documents slip through or repeat between pages. Always append a unique field — the
document id — as the final sort key.

**Incorrect (a non-unique sort with ties):**

```typescript
// infra/elasticsearch/elasticsearch.backend.ts — a non-unique sort (the anti-pattern)
const sort = [{ createdAt: 'desc' }]; // many documents share a millisecond
const res = await this.es.search({ index: 'users', sort, size: limit, search_after });
// Ties between pages: some documents are skipped, others appear twice.
```

Why it is wrong: with equal sort values, the order between them is undefined, so the boundary
between pages is ambiguous and results are lost or duplicated.

**Correct (a unique tiebreaker as the final sort key):**

```typescript
// modules/users/search/users.search.repository.ts
const sort = [
  { createdAt: 'desc' }, // the user's chosen sort
  { _id: 'asc' },        // unique tiebreaker -> the sort is total
];

return this.searchIds(query, sort, args.limit, cursor);
```

Why it is right: the `_id` tiebreaker makes the sort total, so every page boundary is unambiguous
and no document is skipped or repeated.

The tiebreaker must be **unique and present on every indexed document**. A raw relevance sort
(`_score`) is not total either, so it also needs a tiebreaker. When a PIT is in use, Elasticsearch
adds an implicit `_shard_doc` tiebreaker, but an explicit unique field is still the portable choice.

Reference: [Elasticsearch — search_after and tiebreaker](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)

---

## 5. Cross-Entity

**Section Impact: MEDIUM-HIGH**

### 5.1 Cache Derived Counters on the Owning Document

**Impact: MEDIUM-HIGH** — sortable, filterable, cheap derived values

Elasticsearch can only sort or filter on a value that is indexed, and a per-event aggregate is too
expensive to run on every increment. For a derived value that must be searchable — a view, like, or
comment count — cache it on the owning document in MongoDB, update it with an atomic `$inc`, and
mirror it into the index. The counter is a deliberate materialised cache, not a second source of
truth computed on read.

**Incorrect (no indexed value, or an aggregate per event):**

```typescript
// the count lives only in a comments collection, so it cannot be sorted or filtered in search
// and every view event runs a count aggregation against it
@OnEvent('view.created')
async onView(e: { postId: string }): Promise<void> {
  await this.postsSearch.enqueueIndex(e.postId); // reindex, but nothing to sort on
}
```

Why it is wrong: without an indexed value you cannot sort posts by popularity, and recomputing the
count per event is expensive under a high-frequency signal like views.

**Correct (atomic counter on the owner, mirrored into the index):**

```typescript
// modules/posts/repositories/posts.repository.ts — the cached counter
incrViews(postId: string): Promise<PostDocument | null> {
  return this.postModel
    .findByIdAndUpdate(postId, { $inc: { viewCount: 1 } }, { new: true })
    .exec();
}

// modules/posts/search/posts.search-indexer.ts — update the cache, then reindex the owner
@OnEvent('view.created')
async onView(e: { postId: string }): Promise<void> {
  await this.posts.incrViews(e.postId);          // cheap, atomic
  await this.postsSearch.enqueueIndex(e.postId); // debounced by jobId (see sync-debounce-same-id)
}
```

```typescript
// the counter is part of the post's search document
export type PostSearchDocument =
  Pick<PostDocument, 'title' | 'createdAt' | 'viewCount'>  // viewCount is indexed and sortable
  & { id: string; authorName: string };
```

Why it is right: `viewCount` is one atomic `$inc` on write, is indexed so posts can be sorted by
popularity, and reindexing the owner is debounced so a view storm produces one index update.

This is MongoDB's computed-value pattern applied where it earns its keep: the value is read far more
often than written and it must be searchable, so it is cached and owned by the document that holds
it. A value that is only ever displayed can stay derived on read.

Reference: [MongoDB — $inc](https://www.mongodb.com/docs/manual/reference/operator/update/inc/) | [MongoDB — Computed Values Pattern](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/computed-values/)

---

### 5.2 The Owning Module Subscribes; Others Emit Their Own Events

**Impact: MEDIUM-HIGH** — index ownership stays one-directional; no cross-module coupling

When one entity changes a derived value on another — a comment changes a post's comment count, a
track changes a post's view count — the module that **owns the index** subscribes to the change. The
contributing module emits an event about **its own** aggregate and learns nothing about the other
module's index. Never make the contributing module emit an event named after another module's
concern.

**Incorrect (the contributing module knows about the other module's index):**

```typescript
// modules/comments/comments.service.ts — comments must not know about the posts index
async addComment(input: AddCommentInput): Promise<Comment> {
  const comment = await this.commentsRepository.create(input);
  this.events.emit('post.stats-changed', { postId: input.postId }); // invents a post concern
  return comment;
}
```

Why it is wrong: the comments module couples to the posts module's derived concern and to the
existence of a posts index, so the boundary is inverted and the two features become entangled.

**Correct (the contributor emits its own fact; the owner subscribes):**

```typescript
// modules/comments/comments.service.ts — emits a comment fact, nothing about posts
async addComment(input: AddCommentInput): Promise<Comment> {
  const comment = await this.commentsRepository.create(input);
  this.events.emit('comment.created', { commentId: comment._id.toString(), postId: input.postId });
  return comment;
}

// modules/posts/search/posts.search-indexer.ts — the post index owner subscribes
@OnEvent('comment.created')
@OnEvent('comment.deleted')
async onCommentChanged(e: { postId: string }): Promise<void> {
  await this.posts.recomputeStats(e.postId);     // update the post's own derived value
  await this.postsSearch.enqueueIndex(e.postId); // reindex the post
}
```

Why it is right: comments emits a fact about comments and stays fully independent; only the module
that owns the post index decides that a comment affects a post.

Dependency direction: **Posts knows comments exist; comments knows nothing.** This is the same
owning-module principle as `relations-owning-module` in `nestjs-graphql-structure`, applied to the
index. Owned derived values are cached on the owning document so recomputation on an event is cheap
— see `rel-derived-counter-cache`.

See `arch-use-events` in the `nestjs-best-practices` skill for when an event is the right coupling
and when a direct call is the right tool.

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)

---

## 6. Operations & DX

**Section Impact: MEDIUM**

### 6.1 Provide Migration and Reindex CLI Commands

**Impact: MEDIUM-HIGH** — reindex and mapping changes are deliberate, repeatable steps

Boot-time creation keeps the app working, but filling an index and applying a mapping change are
deliberate operations that belong in commands, not in the request path. Provide a small CLI with
`search:migrate`, `search:reindex`, and a mapping/inspection helper. The commands enqueue the same
shared reindex job the app uses, so there is one implementation of the work.

**Incorrect (an unconditional, blocking reindex on every boot, or a reindex run by hand with curl):**

```typescript
// a controller or a boot hook that kicks off a full reindex whenever the app starts
async onApplicationBootstrap() {
  await this.reindexEverything(); // every instance, every restart, against a healthy index too
}
```

Why it is wrong: the problem is not that boot may reindex, it is that this always does. It re-runs
against a fully populated, healthy index, blocks startup while it runs on every instance, and gives
an operator no way to watch, skip, or re-run it. The accepted boot trigger is the opposite: a guard
that checks the live index and enqueues a job **only when the index is empty**, then returns (see
`sync-full-reindex-alias-swap`).

**Correct (scripts that enqueue the shared job):**

```typescript
// infra/elasticsearch/search.cli.ts
#!/usr/bin/env tsx
async function main(): Promise<void> {
  const [command, alias, version] = process.argv.slice(2);

  // Every command targets ONE feature's index. Never act on an undefined alias:
  // a missing argument would otherwise swap an alias named "undefined" (or "undefined_v1").
  if (!command || !alias) {
    console.error('usage: search.cli.ts <migrate|reindex|mapping> <alias> [version]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);

  switch (command) {
    case 'migrate':
      await app.get(SearchMigrationService).migrate(alias); // create + reindex + swap alias
      break;
    case 'reindex':
      await app.get(SearchReindexEngine).enqueueFull(alias, version ?? `${alias}_v1`);
      break;
    case 'mapping':
      // print the live mapping, and expose _analyze for a field/value
      console.log(JSON.stringify(await app.get(SearchInspector).mapping(alias), null, 2));
      break;
    default:
      console.error(`unknown command: ${command}`);
      await app.close();
      process.exit(1);
  }
  await app.close();
}
void main();
```

```json
// package.json
{
  "scripts": {
    "search:migrate": "tsx infra/elasticsearch/search.cli.ts migrate",
    "search:reindex": "tsx infra/elasticsearch/search.cli.ts reindex",
    "search:mapping": "tsx infra/elasticsearch/search.cli.ts mapping"
  }
}
```

Why it is right: reindexing and migration are explicit, observable, repeatable steps, and they run
through the same engine the background worker uses.

The alias is a required argument because every command acts on exactly one index. npm forwards
anything after `--`, so the invocation is `npm run search:reindex -- users`; a bare
`npm run search:reindex` exits with a usage error instead of acting on an undefined alias.

The three triggers for the shared full-reindex job are: this CLI (a deliberate migration), a
boot-time enqueue when the current index is empty, and a nightly reconcile. All three enqueue the
same job with the same stable `jobId`, so a fleet of instances collapses to one run — see
`sync-full-reindex-alias-swap`. This is not the incremental catch-up: changes made outside the app
are picked up by the two-minute sweep in `ops-no-cron-for-indexing`, which re-reads changed documents
and never swaps an alias. The mapping command is also how you invoke `_analyze` to check a field's
analyzer (see `map-analyzers`).

Reference: [NestJS Standalone applications](https://docs.nestjs.com/standalone-applications) | [Elasticsearch — Index APIs](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-create)

---

### 6.2 Provide an Explain Hook

**Impact: MEDIUM** — the exact query DSL is inspectable while developing

When a search returns the wrong results, the fastest diagnosis is the query Elasticsearch actually
ran and why it scored the way it did. Expose a development-only hook that returns the query DSL, the
`took` time, and the hits — the same DSL can be pasted into Kibana Dev Tools. It also lets derived
and Elasticsearch-only fields (which never appear in normal results) be inspected.

**Incorrect (no way to see the query, or a temporary console.log in the repository):**

```typescript
async findIds(args: FindUsersArgs) {
  const query = buildQuery(args);
  console.log(query); // a temporary log that must be removed, and only shows the request
  return this.searchIds(query, sort, args.limit);
}
```

Why it is wrong: the query is only visible if someone remembers to add a log, and the response
(score, `took`, matched terms) is not visible at all.

**Correct (a dev-only explain that returns the DSL and the response):**

```typescript
// infra/elasticsearch/elasticsearch.backend.ts — explain names the client, so it lives in the
// backend behind the seam; no feature repository ever injects ElasticsearchService.
async explain(req: SearchRequest): Promise<SearchExplain> {
  const query = this.buildQuery(req.term);
  const res = await this.es.search({
    index: req.alias,
    query,
    sort: req.sort,
    size: 5,
    _source: ['authorName', 'likeCount'], // inspect ES-only fields here
  });

  return {
    query,                              // paste into Kibana Dev Tools
    took: res.took,
    hits: res.hits.hits.map((h) => ({ id: h._id, score: h._score, source: h._source })),
  };
}

// modules/users/search/users.search-repository.ts — the feature repo delegates; it names no client
explain(args: FindUsersArgs): Promise<SearchExplain> {
  return this.backend.explain({
    alias: this.index,
    term: args.search,
    sort: [{ createdAt: 'desc' }, { _id: 'asc' }],
    limit: 5,
  });
}

// modules/users/resolvers/users.query.resolver.ts — development-only query
@Query(() => String, { nullable: true })
async searchExplain(@Args() args: FindUsersArgs): Promise<string> {
  if (process.env.NODE_ENV === 'production') return null; // never expose in production
  return JSON.stringify(await this.usersSearch.explain(args), null, 2);
}
```

Why it is right: the exact DSL, the score, the timing, and the Elasticsearch-only fields are
available on demand, the query can be reproduced verbatim in Kibana or with the `_explain` API, and
the engine stays behind the seam. With `SEARCH_BACKEND=mongo` the fallback backend refuses the call
rather than pretending to explain a query that does not exist (see `cfg-mongo-fallback-backend`).

Gate the hook behind a non-production environment check; it exposes internal query shapes and
Elasticsearch-only fields. The same DSL is what the request/response logger records in production
(see `ops-log-es-requests`).

Reference: [Elasticsearch — Explain API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-explain) | [Kibana Dev Tools](https://www.elastic.co/docs/explore-analyze/query-filter/tools/console)

---

### 6.3 Include Elasticsearch in Health Checks

**Impact: MEDIUM** — a search outage is visible before users report it

Search depends on an external cluster. Add an Elasticsearch check to the readiness probe so an
orchestrator marks the service not-ready (or alerts) when the cluster is unreachable, instead of
serving searches that silently return nothing. Elasticsearch is a dependency of search, so it belongs
in readiness — not the liveness probe, which decides whether to restart the process.

**Incorrect (no search dependency in health, or ES in liveness):**

```typescript
@Query(() => String, { name: 'health' })
health(): string {
  return 'ok'; // reports healthy while the search cluster is down
}
```

Why it is wrong: the service reports healthy and keeps taking traffic while every search fails, and
if the check were in liveness it would restart a process that is fine.

**Correct (an Elasticsearch check in the readiness probe):**

```typescript
// modules/health/health.resolver.ts
@Query(() => HealthCheckResult, { name: 'healthReady' })
@HealthCheck()
ready() {
  return this.health.check([
    () => this.db.pingCheck('database'),          // MongoDB — the source of truth
    () => this.es.pingCheck('elasticsearch'),     // the search dependency
  ]);
}
```

Why it is right: readiness reflects both the source of truth and the search dependency, so an
Elasticsearch outage is visible and routes traffic away before users hit broken searches.

Keep the Elasticsearch check in **readiness**, paired with the database ping: if either is down the
instance cannot fully serve. The liveness probe (memory, event-loop) stays separate, because an
Elasticsearch outage is not a reason to restart the process. Wire the probes to the health module's
queries.

The check belongs in readiness only when Elasticsearch is actually the search backend. When search is
configured off (`SEARCH_BACKEND=mongo`, see `cfg-search-backend-seam`), Elasticsearch is not a
dependency of the instance, so the ping is absent from the check entirely — it is neither run nor
reported healthy. Reporting a dependency you do not call as "up" is a false signal; omitting it is
the honest state.

```typescript
ready() {
  return this.health.check([
    () => this.db.pingCheck('database'),                             // MongoDB — the source of truth
    ...(this.isElasticsearchBackend
      ? [() => this.es.pingCheck('elasticsearch')]                   // only when ES is the backend
      : []),
  ]);
}
```

See `devops-use-health-checks` in the `nestjs-best-practices` skill for the liveness/readiness split
this check follows.

Reference: [NestJS Terminus](https://docs.nestjs.com/recipes/terminus)

---

### 6.4 Log Elasticsearch Requests and Responses

**Impact: MEDIUM-HIGH** — every query is traceable by correlation id

The Elasticsearch client emits `request` and `response` events but logs nothing by default, and it
retries a failing request, so several `request` events can belong to one logical call. The client
already tags every event with a per-request id — `result.meta.request.id` — and a retry reuses it, so
grouping by that id shows the retry behaviour. Log it through the app's structured logger and redact
credentials. This is what makes a slow or failing search diagnosable in production.

**Incorrect (no visibility, or raw console logging):**

```typescript
@Injectable()
export class SearchService {
  constructor(private readonly es: ElasticsearchService) {
    // nothing: a slow or failing query leaves no trace in the logs
  }
}
```

Why it is wrong: when a search is slow or returns nothing, there is no record of the query, its
duration, or how many hits it produced.

**Correct (per-call correlation id, logged through the structured logger):**

```typescript
// infra/elasticsearch/elasticsearch.logger.ts
@Injectable()
export class ElasticsearchLogger implements OnModuleInit {
  constructor(
    private readonly es: ElasticsearchService,
    private readonly logger: JsonLogger,
  ) {}

  onModuleInit(): void {
    // the client generates one id per request, and the matching `response` carries the same id
    this.es.on('request', (err, result) => {
      if (err) return;
      this.logger.log('es request', ElasticsearchLogger.name, {
        requestId: result.meta.request.id,
        method: result.meta.request.params.method,
        path: result.meta.request.params.path,
      });
    });

    this.es.on('response', (err, result) => {
      this.logger.log('es response', ElasticsearchLogger.name, {
        requestId: result.meta.request.id,
        status: result.meta.statusCode,
        took: result.meta.body?.took,
        hits: result.meta.body?.hits?.total,
      });
    });
  }
}
```

Why it is right: each call has a correlation id, the query path, status, `took`, and hit count are
logged as structured fields, and the app's existing logger owns formatting.

The correlation id also makes retries legible: a failing call produces several `request` events but
one `response`, so grouping by id shows the retry behaviour. The default id is an incremental
integer, unique within one client instance but not across replicas — for a globally unique id, or to
see the same id in Elasticsearch's slow logs and running tasks, pass a request-scoped `opaqueId` per
call (it becomes the `X-Opaque-Id` header) and set `opaqueIdPrefix` to the instance name. Never send
the app's own logs into the same Elasticsearch cluster being debugged without care, and never log
request bodies unredacted if they can contain user data.

Reference: [@elastic/elasticsearch — Client events](https://www.elastic.co/docs/reference/elasticsearch/clients/javascript/advanced-config) | [NestJS Logger](https://docs.nestjs.com/techniques/logger)

---

### 6.5 Never Schedule Indexing with an In-Process Timer

**Impact: HIGH** — no idle polling; one worker across all instances

`@Interval` and `@Cron` run inside each application process, so with N instances the timer fires N
times — duplicated work and races — and a fixed interval runs even when there is nothing to index.
Schedule periodic search work with a BullMQ job scheduler, which lives in Redis and is processed by
exactly one worker. Prefer scheduling on demand (a debounced job) over polling at all.

**Incorrect (an interval in every instance, ticking when idle):**

```typescript
@Injectable()
export class SearchFlushJob {
  @Interval(1000) // every instance runs this; duplicates and races across N instances
  async flush(): Promise<void> {
    const ids = await this.redis.spop('search:dirty:posts', 1000);
    if (ids.length) await this.reindex.enqueueMany(ids);
  }
}
```

Why it is wrong: each replica executes the timer, so the same flush runs N times, and it ticks every
second whether or not there is work.

**Correct (a BullMQ scheduler — one runner, set once):**

```typescript
// SearchIndexRegistry.ensure() — idempotent across restarts and instances
await this.queue.upsertJobScheduler(       // Redis only: register BEFORE the Elasticsearch-dependent
  `sweep:${def.alias}`,                    // index ensure, so an instance that booted while the
  { every: 120_000 },                      // cluster was down still gets swept and retries it
  { name: 'sweep-index', data: { alias: def.alias } },
);

// common/search/search-reindex.processor.ts — processed by exactly one worker
@Process('sweep-index')
async sweep(job: Job<{ alias: string }>): Promise<void> {
  const repo = this.registry.repository(job.data.alias);
  const since = await this.watermark.get(job.data.alias);
  const ids = await repo.findChangedSince(since, 1000);
  if (ids.length) await repo.enqueueMany(ids);
  await this.watermark.set(job.data.alias, new Date());
}

// common/search/search.watermark.ts — one Redis key per alias, in the shared search layer
@Injectable()
export class SearchWatermark {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async get(alias: string): Promise<Date> {
    const stored = await this.redis.get(`search:watermark:${alias}`);
    // no watermark yet: re-read from the beginning rather than silently skipping history
    return stored ? new Date(stored) : new Date(0);
  }

  async set(alias: string, at: Date): Promise<void> {
    await this.redis.set(`search:watermark:${alias}`, at.toISOString());
  }
}
```

Why it is right: `upsertJobScheduler` is idempotent, the job lives in Redis and is fetched by one
worker, and a sweep with nothing to do is one query, not a timer firing forever. The scheduler is
registered before the Elasticsearch-dependent index ensure, so an instance that booted while the
cluster was down still gets its sweep — which retries the deferred ensure on the next tick.

When a timer is genuinely local to one node — a cache warm-up with no shared state — `@Interval` is
fine; anything that indexes shared data is not. This two-minute sweep is the *incremental* catch-up:
it re-reads documents changed since the last watermark and never swaps an alias. That makes it a
different trigger from the full reindex that `sync-full-reindex-alias-swap` and `ops-cli-scripts`
call the nightly reconcile — that one rebuilds an index, and does swap. The sweep is also the safety
net that catches changes made outside the app (a direct MongoDB write, another service), because it
re-reads changed documents regardless of who changed them.

The watermark is a single Redis key per alias (`search:watermark:${alias}`), owned by the shared
search layer beside the pipeline. It must not be in-process state: a per-replica watermark would make
the sweep skip whatever another replica had already swept. Losing it is safe by construction — an
absent watermark means "re-read from the beginning", so the worst case is a wider sweep, never a
missed change.

Reference: [BullMQ — Job schedulers](https://docs.bullmq.io/guide/job-schedulers) | [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)

---

## 7. Configuration & Environments

**Section Impact: HIGH**

### 7.1 Fall Back to a Deterministic MongoDB Finder

**Impact: MEDIUM-HIGH** — search returns real, ordered results without Elasticsearch

When Elasticsearch is not the selected backend, search must still return real data. Because the
contract is already "the index finds identifiers and MongoDB serves the documents"
(`query-ids-only-search`, `query-hydrate-restore-order`), the fallback is small: a `SearchBackend`
that reads MongoDB, returns `_id`s, and leaves every hydration and ordering line unchanged. Make it
deterministic — a stable sort with a unique tiebreaker — so pagination stays correct and tests can
assert exact output.

**Incorrect (an empty page, or random documents):**

```typescript
// the disabled backend returns nothing, so every search looks broken in development
async searchIds(): Promise<SearchPage> {
  return { ids: [], total: 0, totalIsExact: true, nextCursor: null };
}

// or it returns arbitrary documents and ignores the request
async searchIds(): Promise<SearchPage> {
  const docs = await this.model.aggregate([{ $sample: { size: 20 } }]);
  return { ids: docs.map((d) => d._id.toString()), total: 20, totalIsExact: true, nextCursor: null };
}
```

Why it is wrong: an empty page makes the whole feature look dead and hides bugs that only appear when
real results exist; random documents are non-deterministic, so a test cannot assert an order, and the
user sees results that do not answer their query.

**Correct (a MongoDB finder behind the same interface; deterministic order and keyset cursor):**

```typescript
// infra/search/mongo-fallback.backend.ts
@Injectable()
export class MongoFallbackBackend implements SearchBackend {
  readonly enabled = true; // the backend is active; only the engine differs

  constructor(
    @InjectConnection() private readonly connection: Connection, // one connection, many models
    private readonly registry: SearchIndexRegistry,              // alias -> { repository, model }
  ) {}

  // no index work: MongoDB already holds the truth, so these are no-ops
  async ensureIndex(): Promise<void> {}
  async bulkIndex(): Promise<void> {}
  async deleteOne(): Promise<void> {}
  async refresh(): Promise<void> {} // nothing to make visible
  ping(): Promise<boolean> {
    return this.connection.db.admin().ping().then(() => true);
  }

  // explain is an Elasticsearch affordance; there is no engine DSL to show here
  async explain(): Promise<SearchExplain> {
    throw new Error('explain is only available with the Elasticsearch backend');
  }

  async searchIds(req: SearchRequest): Promise<SearchPage> {
    // resolve the feature's model BY ALIAS: one backend serves every feature's index
    const model = this.connection.model(this.registry.model(req.alias));

    const after = req.cursor ? decodeCursor(req.cursor) : null;
    const filter = {
      ...this.termFilter(req.term),
      ...(after
        ? { $or: [{ createdAt: { $lt: after[0] } }, { createdAt: after[0], _id: { $gt: after[1] } }] }
        : {}),
    };

    // the same total sort the Elasticsearch path uses: the requested sort, then a unique tiebreaker
    const docs = await model.find(filter).sort({ createdAt: -1, _id: 1 }).limit(req.limit).lean();
    const last = docs.at(-1);

    return {
      ids: docs.map((d) => d._id.toString()),
      total: await model.countDocuments(this.termFilter(req.term)),
      totalIsExact: true, // MongoDB counts are exact, unlike a capped hits.total
      nextCursor:
        docs.length === req.limit && last ? encodeCursor([last.createdAt, last._id.toString()]) : null,
    };
  }

  private termFilter(term?: string): FilterQuery<unknown> {
    return term ? { name: { $regex: escapeRegex(term), $options: 'i' } } : {};
  }
}
```

Why it is right: the fallback returns real identifiers in a stable order, the shared hydration and
ordering code is untouched, and the cursor carries the same two sort values (the requested sort then
the unique `_id`) that `query-sort-tiebreaker` requires.

**One connection, many models.** `@InjectConnection()` gives the fallback the single Mongoose
connection the application already opens, and the alias resolves to its model through the registry
each feature registers into (see `arch-feature-owned-index`). This is what makes one backend work for
every feature's index. A single injected `Model<unknown>` cannot: Nest cannot resolve a bare model
type (a model needs `@InjectModel(Name)`), and one model could only ever answer for one feature.

Two honest limits. There is no relevance ranking in this mode, so it is for development, tests, and
small deployments rather than a replacement for search quality; the ordering is newest-first unless
you extend `termFilter`. And it keeps `totalIsExact: true` because MongoDB counts exactly, whereas
Elasticsearch may report a capped `hits.total` (`query-ids-only-search`). Do not make this mode the
silent production default: `SEARCH_BACKEND=mongo` belongs in local and test environments, and in
production it should be an explicit, logged choice.

Reference: [NestJS MongoDB](https://docs.nestjs.com/techniques/mongodb) | [MongoDB — Query your data](https://www.mongodb.com/docs/manual/tutorial/query-documents/)

---

### 7.2 Put Search Behind a Backend Seam

**Impact: HIGH** — the app boots and serves without Elasticsearch

Search is an optional capability, not a hard dependency of the application. Put every Elasticsearch
call behind one `SearchBackend` interface and choose the implementation from configuration. The
application then boots, serves its non-search endpoints, and runs its tests with no cluster
available, and a developer can turn search on per environment instead of running Elasticsearch on
every machine.

**Incorrect (the shared layer injects the raw client, so boot needs the cluster):**

```typescript
// common/search/search.repository.ts
export abstract class SearchRepository<Doc extends { id: string }> {
  constructor(
    protected readonly es: ElasticsearchService, // concrete client, hard dependency
    @InjectQueue('search-reindex') protected readonly queue: Queue,
  ) {}
}
// every feature module now resolves ElasticsearchService, so a missing cluster
// fails module instantiation and the whole app refuses to boot
```

Why it is wrong: the concrete client is a required constructor dependency, so an unreachable cluster
fails startup, a test needs a running Elasticsearch, and swapping the search engine means editing the
shared layer and every feature.

**Correct (one backend interface; the implementation is chosen from config):**

```typescript
// common/search/search.backend.ts — the seam
// One backend is provided app-wide, so every request names the alias it targets. That is what
// lets a single backend serve every feature's index.
export interface SearchRequest {
  alias: string;           // the feature's index alias (see arch-feature-owned-index)
  term?: string;           // the user's search text; each engine builds its own query from it
  sort: object[];          // the requested sort, then the unique tiebreaker
  limit: number;
  cursor?: string | null;  // opaque cursor over the sort values
}

export interface SearchBackend {
  readonly enabled: boolean; // false -> the write path and ensure are skipped
  ensureIndex(def: SearchIndexDef<unknown>): Promise<void>;
  bulkIndex(index: string, docs: unknown[]): Promise<void>;
  deleteOne(index: string, id: string): Promise<void>;
  refresh(index: string): Promise<void>; // make writes visible; a no-op on a non-ES backend
  searchIds(req: SearchRequest): Promise<SearchPage>; // { ids, total, totalIsExact, nextCursor }
  explain(req: SearchRequest): Promise<SearchExplain>; // dev-only introspection; ES-only
  ping(): Promise<boolean>;
}

// infra/elasticsearch/elasticsearch.backend.ts — the Elasticsearch implementation
@Injectable()
export class ElasticsearchBackend implements SearchBackend {
  readonly enabled = true;
  constructor(private readonly es: ElasticsearchService) {}
  // the only class in the codebase that names ElasticsearchService
}

// infra/search/search-backend.provider.ts — one place selects the implementation
export const SEARCH_BACKEND = Symbol('SEARCH_BACKEND');

export const searchBackendProvider: Provider = {
  provide: SEARCH_BACKEND,
  inject: [ConfigService, ElasticsearchBackend, MongoFallbackBackend],
  useFactory: (
    config: ConfigService,
    es: ElasticsearchBackend,
    mongo: MongoFallbackBackend,
  ): SearchBackend => (config.get('search.backend') === 'mongo' ? mongo : es),
};

// common/search/search.repository.ts — depends on the seam, not the client
export abstract class SearchRepository<Doc extends { id: string }> {
  constructor(
    @Inject(SEARCH_BACKEND) protected readonly backend: SearchBackend,
    @InjectQueue('search-reindex') protected readonly queue: Queue,
  ) {}
}
```

```bash
# .env — the one switch (see devops-use-config-module and devops-maintain-env-example)
SEARCH_BACKEND=elasticsearch   # or: mongo
```

Why it is right: the shared layer names only the interface, the implementation is picked in one
factory from typed config, and the app boots with `SEARCH_BACKEND=mongo` on a machine that has no
Elasticsearch.

Two consequences of the switch, both handled elsewhere. Boot-time index creation and the boot-time
fill are skipped when the selected backend is not Elasticsearch, so a disabled environment never
creates an index it will not use (see `sync-idempotent-index-creation`). And readiness includes the
Elasticsearch ping only when the backend actually depends on the cluster; when it does not, the check
is absent, not reported healthy (see `ops-health-check`). The disabled backend itself is the
deterministic MongoDB finder in `cfg-mongo-fallback-backend`, not an empty result.

Keep the switch per environment, not per feature: one `SEARCH_BACKEND` for the whole application.
A per-feature backend would mean two features could disagree about where search lives, and the shared
reindex pipeline (see `arch-base-search-repository`) would have to resolve the engine per alias.

Reference: [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers) | [@nestjs/elasticsearch](https://github.com/nestjs/elasticsearch)

---

## 8. Testing

**Section Impact: MEDIUM-HIGH**

### 8.1 Mock the Search Backend Seam in Unit Tests

**Impact: HIGH** — unit tests run with no Elasticsearch

The base repository is the single place every feature touches search
(`arch-base-search-repository`), and it depends on the `SearchBackend` interface
(`cfg-search-backend-seam`). That makes one fake enough for the whole codebase: provide a stub backend
in the testing module and no test ever needs a running cluster. Never call a live Elasticsearch from
a unit test (see `test-mock-external-services` in the `nestjs-best-practices` skill).

**Incorrect (the test instantiates the real client, or points at localhost):**

```typescript
// hits a real cluster that may not be running; slow and flaky
const service = new UsersService(
  new ElasticsearchService({ node: 'http://localhost:9200' }),
  usersRepo,
);

// or a mock so thin it asserts nothing about the contract
const backend = { searchIds: async () => ({ ids: [] }) };
```

Why it is wrong: the first needs Elasticsearch on every machine and in CI, and the second returns an
empty shape the real contract never produces, so the test passes while the hydration path is
untested.

**Correct (stub the interface; assert hydration and ordering):**

```typescript
// modules/users/services/users.service.spec.ts
const search = {
  enabled: true,
  searchIds: async () => ({ ids: ['b', 'a'], total: 2, totalIsExact: true, nextCursor: null }),
} as unknown as SearchBackend;
const users = { findByIds: async () => [/* MongoDB order: a, b */] };

const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: SEARCH_BACKEND, useValue: search },
    { provide: UsersRepository, useValue: users },
  ],
}).compile();

const service = module.get(UsersService);
const { nodes } = await service.findMany({ term: 'x' });

expect(nodes.map((n) => n.id)).toEqual(['b', 'a']); // relevance order restored, not MongoDB order
```

Why it is right: the fake implements the same shape the real backend returns, the test asserts the
behavior that matters (hydration plus order restoration), and moving search to a new engine changes
only the `SEARCH_BACKEND` provider, not the test.

Let the stub backend implement the whole interface, even the methods the unit under test does not
call. A partial object cast with `as unknown as SearchBackend` is acceptable in a test, but it hides
a new interface method from every future test, so prefer a small `createFakeSearchBackend()` helper
when more than one suite needs it.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing) | [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers)

---

### 8.2 Test Query Semantics Against a Real Elasticsearch

**Impact: MEDIUM-HIGH** — analyzers, DSL and pagination are verified for real

A mocked backend proves your code calls the right method; it proves nothing about what Elasticsearch
does with the query. Analyzer behavior (`map-analyzers`), the default `_score` ordering, and
`search_after` pagination (`query-cursor-pagination`) exist only in the engine. These few integration
tests need a real cluster, so start a disposable one per suite with Testcontainers and tear it down
afterward. This is integration coverage; unit tests still mock the seam and never call an external
service (`test-mock-elasticsearch-seam`, and `test-mock-external-services` in the
`nestjs-best-practices` skill).

**Incorrect (asserting engine behavior against a hand-rolled fake):**

```typescript
// the fake "matches" on a fuzzy query because the test made it match — this proves nothing
const fake = {
  searchIds: async () => ({ ids: ['1'], total: 1, totalIsExact: true, nextCursor: null }),
};
```

Why it is wrong: the fake returns whatever the test told it to, so a wrong analyzer, a mapping that
never indexes a field, or a broken `search_after` cursor all pass.

**Correct (a throwaway cluster for the query-semantics suite):**

```typescript
// test/search.e2e-spec.ts
import { ElasticsearchContainer, StartedElasticsearchContainer } from '@testcontainers/elasticsearch';
import { Client } from '@elastic/elasticsearch';

let es: StartedElasticsearchContainer;

beforeAll(async () => {
  es = await new ElasticsearchContainer('docker.elastic.co/elasticsearch/elasticsearch:8.15.0')
    .withEnvironment({ 'xpack.security.enabled': 'false' })
    .start();
}, 120_000);

afterAll(async () => {
  await es?.stop();
});

it('matches partial words with the configured analyzer', async () => {
  const client = new Client({ node: es.getHttpUrl() });
  await client.indices.create({
    index: 'users_v1',
    mappings: { properties: USER_SEARCH_MAPPING },
  });
  await client.index({
    index: 'users_v1',
    id: '1',
    document: { name: 'Elasticsearch' },
    refresh: true,
  });

  const res = await client.search({ index: 'users_v1', query: { match: { name: 'elastic' } } });
  expect(res.hits.hits.map((h) => h._id)).toEqual(['1']); // standard analyzer lowercased the term
});
```

Why it is right: the analyzer, mapping, and query run against the engine that will run them in
production, so a mapping or analyzer regression fails the suite instead of surfacing later as wrong
search results.

The suite needs a container runtime (Docker or Podman) locally and in CI; keep it in its own file so
the fast unit suite does not depend on one. Pin the image tag, not `latest`, so the engine behavior a
test asserts does not change underneath it. This is the only place that hits a live cluster; if the
whole suite would otherwise need Elasticsearch, that is a sign the mocked seam in
`test-mock-elasticsearch-seam` is missing from a unit test.

Reference: [Testcontainers for Node.js](https://node.testcontainers.org/) | [@nestjs/elasticsearch](https://github.com/nestjs/elasticsearch)

---

## References

- https://github.com/nestjs/elasticsearch
- https://www.npmjs.com/package/@nestjs/elasticsearch
- https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results
- https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-open-point-in-time
- https://www.elastic.co/docs/reference/elasticsearch/rest-apis/retrieve-selected-fields
- https://www.elastic.co/docs/manage-data/data-store/aliases
- https://docs.nestjs.com/techniques/queues
- https://docs.nestjs.com/recipes/terminus
- https://docs.nestjs.com/techniques/events
- https://docs.nestjs.com/fundamentals/custom-providers
- https://node.testcontainers.org/
- https://docs.mongodb.com/manual/changeStreams/
- https://docs.mongodb.com/manual/tutorial/query-documents/
- https://mongoosejs.com/docs/guide.html

---

*Generated by build-agents.ts from `rules/` — edit the rules, not this file.*
