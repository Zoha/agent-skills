---
name: nestjs-elasticsearch
description: Use when adding or maintaining Elasticsearch full-text search in a NestJS backend — client and module wiring, MongoDB-to-Elasticsearch sync and reindexing, index mappings and the search projection, ID-only queries with MongoDB hydration, cursor pagination, and cross-entity derived fields.
license: MIT
metadata:
  author: Zoha
  version: "1.0.0"
---

# NestJS Elasticsearch

Integration guide for adding Elasticsearch-backed search to a NestJS GraphQL + MongoDB
application. It fixes the architectural boundary (generic infra, a shared search layer, one
owned index per feature), then covers the full lifecycle: the search projection, indexing and
sync, ID-only querying with MongoDB hydration, cursor pagination, cross-entity derived fields,
and the operations and DX around all of it.

The guiding contract is **Elasticsearch finds, MongoDB serves**: Elasticsearch is a pure
search index that returns identifiers, and the requested entities are always hydrated from
MongoDB, the source of truth.

## When to Apply

Reference these guidelines when:

- Adding search to an existing NestJS GraphQL + MongoDB application
- Wiring the `@nestjs/elasticsearch` client and the shared search layer
- Defining or changing an index mapping or the search projection
- Implementing MongoDB-to-Elasticsearch sync, reindexing, or index migrations
- Writing a search query, cursor pagination, or result hydration
- Keeping a derived value (counts, ratings) searchable across entities
- Debugging stale search results or indexing storms

## Rule Categories by Priority

<!-- GENERATED:START:sections -->
| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Architecture | CRITICAL | `arch-` |
| 2 | Indexing & Sync | CRITICAL | `sync-` |
| 3 | Schema & Mapping | HIGH | `map-` |
| 4 | Querying | HIGH | `query-` |
| 5 | Cross-Entity | MEDIUM-HIGH | `rel-` |
| 6 | Operations & DX | MEDIUM | `ops-` |
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
### 1. Architecture (CRITICAL)

- `arch-base-search-repository` - Put Shared Index and Query Logic in a Base Repository
- `arch-entity-vs-search-document` - Keep Elasticsearch Fields Out of the Entity
- `arch-feature-owned-index` - Let Each Feature Own and Register Its Index
- `arch-infra-module` - Isolate the Elasticsearch Client in a Generic Infra Module

### 2. Indexing & Sync (CRITICAL)

- `sync-bulk-index` - Index in Batches with the Bulk API
- `sync-debounce-same-id` - Debounce Same-Id Bursts
- `sync-delete-immediately` - Delete from the Index Immediately
- `sync-enqueue-index` - Enqueue Indexing; Never Write to Elasticsearch Inline
- `sync-full-reindex-alias-swap` - Reindex Through a Versioned Index and Swap the Alias
- `sync-idempotent-index-creation` - Create Indices Idempotently with Deterministic Names

### 3. Schema & Mapping (HIGH)

- `map-analyzers` - Choose Text Analyzers Deliberately
- `map-derived-fields` - Compute Derived and Relation Fields in a Batch Mapper
- `map-exclude-non-search-fields` - Index Only Fields With a Search Purpose
- `map-mapping-object` - Declare the Mapping as a Typed Object
- `map-typed-search-document` - Type the Search Document Against the Entity

### 4. Querying (HIGH)

- `query-cursor-pagination` - Paginate with search_after
- `query-hydrate-restore-order` - Hydrate from MongoDB and Restore Relevance Order
- `query-ids-only-search` - Search Returns IDs Only
- `query-sort-tiebreaker` - Always Include a Unique Sort Tiebreaker

### 5. Cross-Entity (MEDIUM-HIGH)

- `rel-derived-counter-cache` - Cache Derived Counters on the Owning Document
- `rel-owning-module-subscribes` - The Owning Module Subscribes; Others Emit Their Own Events

### 6. Operations & DX (MEDIUM)

- `ops-cli-scripts` - Provide Migration and Reindex CLI Commands
- `ops-explain-debug` - Provide an Explain Hook
- `ops-health-check` - Include Elasticsearch in Health Checks
- `ops-log-es-requests` - Log Elasticsearch Requests and Responses
- `ops-no-cron-for-indexing` - Never Schedule Indexing with an In-Process Timer
<!-- GENERATED:END:rules -->

## How to Use

Read individual rule files for detailed explanations and code examples:

```
rules/arch-entity-vs-search-document.md
rules/sync-full-reindex-alias-swap.md
rules/query-ids-only-search.md
```

Each rule file contains:
- Brief explanation of why it matters and which layer it applies to
- Incorrect code example with explanation
- Correct code example with explanation
- Additional context and references

## Relation to Other Skills

- **`nestjs-graphql-structure`** — file placement. This skill adds the `search/` folder to a
  feature and the `common/search/` + `infra/elasticsearch/` layers; it follows that skill's
  feature-module, repository, and event rules.
- **`nestjs-best-practices`** — behavioral rules for services, events, queues, config, and
  health checks that this skill's examples build on.

## Full Compiled Document

For the complete guide with all rules expanded in a single document, see
[AGENTS.md](./AGENTS.md).
