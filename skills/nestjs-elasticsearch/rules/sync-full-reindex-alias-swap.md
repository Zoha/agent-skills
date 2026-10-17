---
title: Reindex Through a Versioned Index and Swap the Alias
impact: CRITICAL
impactDescription: "mapping changes ship with zero downtime"
tags: sync, reindex, alias, migrations
---

## Reindex Through a Versioned Index and Swap the Alias

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
await this.es.indices.refresh({ index: target });
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
