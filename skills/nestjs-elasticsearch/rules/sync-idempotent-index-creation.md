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
