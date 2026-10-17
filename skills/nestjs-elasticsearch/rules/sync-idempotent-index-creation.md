---
title: Create Indices Idempotently with Deterministic Names
impact: CRITICAL
impactDescription: "concurrent instances converge; boot never crashes"
tags: sync, bootstrap, idempotency, multi-instance
---

## Create Indices Idempotently with Deterministic Names

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
```

Why it is wrong: a non-deterministic name makes the creation non-idempotent — each instance creates
its own index — and an unhandled create error fails application startup.

**Correct (deterministic name, idempotent create, ignored conflicts):**

```typescript
// infra/elasticsearch/ensure-index.ts
export async function ensureIndex(es: ElasticsearchService, def: SearchIndexDef<unknown>): Promise<void> {
  await es.indices.create(
    { index: def.version, mappings: { properties: def.mapping } },
    { ignore: [400] },                      // already exists -> fine, race-safe
  );
  await es.indices.updateAliases(
    { actions: [{ add: { index: def.version, alias: def.alias } }] },
    { ignore: [400] },
  );
}
```

Why it is right: with a fixed name (`users_v1`) exactly one concurrent create wins and the others
treat `400` as success, so every instance boots without crashing and they all converge on the same
index.

The same property answers "the app booted but migrations were not run": creation happens on boot
regardless, so the app works with an empty index and returns no results until a reindex job fills
it — it never crashes because a migration step was skipped. Only when the **mapping changes** do you
bump the version and run a deliberate reindex (see `sync-full-reindex-alias-swap`).

Reference: [Elasticsearch — Create index API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-create)
