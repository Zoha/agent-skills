---
title: Put Search Behind a Backend Seam
impact: HIGH
impactDescription: "the app boots and serves without Elasticsearch"
tags: config, architecture, backend, seam
---

## Put Search Behind a Backend Seam

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
export interface SearchBackend {
  readonly enabled: boolean; // false -> the write path and ensure are skipped
  ensureIndex(def: SearchIndexDef<unknown>): Promise<void>;
  bulkIndex(index: string, docs: unknown[]): Promise<void>;
  deleteOne(index: string, id: string): Promise<void>;
  searchIds(req: SearchRequest): Promise<SearchPage>; // { ids, total, totalIsExact, nextCursor }
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
