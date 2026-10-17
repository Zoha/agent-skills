---
title: Isolate the Elasticsearch Client in a Generic Infra Module
impact: CRITICAL
impactDescription: "one connection; features stay unaware of the client"
tags: architecture, infra, modules, elasticsearch
---

## Isolate the Elasticsearch Client in a Generic Infra Module

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

Reference: [nestjs/elasticsearch](https://github.com/nestjs/elasticsearch) | [NestJS Modules](https://docs.nestjs.com/modules)
