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

// common/search/search-reindex.engine.ts — swap only after the loop completes
let cursor: string | undefined;
for (;;) {
  const page = await repo.loadBatch(cursor, 500);
  if (!page.docs.length) break;
  await repo.bulkIndex(page.docs);
  cursor = page.nextCursor;
  if (!cursor) break;                    // last page
}
await this.es.indices.refresh({ index: target });
await this.swapAlias(alias, target);     // reached only on clean completion

private async swapAlias(alias: string, target: string): Promise<void> {
  const current = await this.es.indices.getAlias({ name: alias }, { ignore: [404] });
  await this.es.indices.updateAliases({
    actions: [
      ...Object.keys(current?.body ?? {}).map((i) => ({ remove: { index: i, alias } })),
      { add: { index: target, alias } },   // one atomic call: never a gap
    ],
  });
}
```

Why it is right: the new index is filled completely before the alias points at it, the swap is a
single atomic cluster-state update, and if the reindex throws the alias still points at the old
index, so search keeps working.

Triggers are one worker: a CLI command for a deliberate migration, a boot-time enqueue when the
current index is empty, and a nightly reconcile. The alias swap must never run on the enqueue path.

Reference: [Elasticsearch — Aliases](https://www.elastic.co/docs/manage-data/data-store/aliases) | [nestjs-graphql-structure — data-repository](https://docs.nestjs.com/techniques/mongodb)
