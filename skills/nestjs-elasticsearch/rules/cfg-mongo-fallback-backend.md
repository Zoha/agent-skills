---
title: Fall Back to a Deterministic MongoDB Finder
impact: MEDIUM-HIGH
impactDescription: "search returns real, ordered results without Elasticsearch"
tags: config, fallback, mongodb, determinism
---

## Fall Back to a Deterministic MongoDB Finder

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
  ping(): Promise<boolean> {
    return this.connection.db.admin().ping().then(() => true);
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
