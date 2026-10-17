---
title: Provide Migration and Reindex CLI Commands
impact: MEDIUM-HIGH
impactDescription: "reindex and mapping changes are deliberate, repeatable steps"
tags: ops, cli, migrations, reindex
---

## Provide Migration and Reindex CLI Commands

**Impact: MEDIUM-HIGH** — reindex and mapping changes are deliberate, repeatable steps

Boot-time creation keeps the app working, but filling an index and applying a mapping change are
deliberate operations that belong in commands, not in the request path. Provide a small CLI with
`search:migrate`, `search:reindex`, and a mapping/inspection helper. The commands enqueue the same
shared reindex job the app uses, so there is one implementation of the work.

**Incorrect (a reindex triggered from application code, or run by hand with curl):**

```typescript
// a controller or a boot hook that kicks off a full reindex whenever the app starts
async onApplicationBootstrap() {
  await this.reindexEverything(); // every instance, every restart, blocking startup
}
```

Why it is wrong: the reindex runs implicitly on every boot and on every instance, blocks startup,
and cannot be run deliberately, watched, or re-run safely.

**Correct (scripts that enqueue the shared job):**

```typescript
// infra/elasticsearch/search.cli.ts
#!/usr/bin/env tsx
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const args = process.argv.slice(2);

  switch (args[0]) {
    case 'migrate':
      await app.get(SearchMigrationService).migrate(args[1]); // create + reindex + swap alias
      break;
    case 'reindex':
      await app.get(SearchReindexEngine).enqueueFull(args[1], args[2] ?? `${args[1]}_v1`);
      break;
    case 'mapping':
      // print the live mapping, and expose _analyze for a field/value
      console.log(JSON.stringify(await app.get(SearchInspector).mapping(args[1]), null, 2));
      break;
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

The three triggers for the shared full-reindex job are: this CLI (a deliberate migration), a
boot-time enqueue when the current index is empty, and a nightly reconcile. All three enqueue the
same job with the same stable `jobId`, so a fleet of instances collapses to one run — see
`sync-full-reindex-alias-swap`. This is not the incremental catch-up: changes made outside the app
are picked up by the two-minute sweep in `ops-no-cron-for-indexing`, which re-reads changed documents
and never swaps an alias. The mapping command is also how you invoke `_analyze` to check a field's
analyzer (see `map-analyzers`).

Reference: [NestJS Standalone applications](https://docs.nestjs.com/standalone-applications) | [Elasticsearch — Index APIs](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-create)
