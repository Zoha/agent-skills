---
title: Tags Are Purge-Only, Never for Lookup
impact: HIGH
impactDescription: using tags to fetch values breaks correctness
tags: tags, references, invalidation
---

## Tags Are Purge-Only, Never for Lookup

**Impact: HIGH (using tags to fetch values breaks correctness)**

Tags (the engine calls them `references`) are a **reverse index**: a value carries many tags, and you
purge all values for a tag. They are only a set of strings linking cached entries to what can
invalidate them. You never fetch a value *by* tag — lookup is always by key.

**Incorrect (reading a value through a tag):**

```typescript
const entries = await client.invalidateAll; // treating tags as a queryable index
const title = entries.find((e) => e.tag === 'title:42'); // nonsense — tags hold keys, not values
```

Why it is wrong: tags do not store results, so this cannot return the cached value and loses the
key→value association.

**Correct (write: attach tags; read: by key; purge: by tag):**

```typescript
// read — attach tags that describe what would invalidate this value
// (result, args) => string[] | null — NEVER a bare string
@Cacheable<[string]>({ ttl: 60, swr: 300 })
@CacheTag((r, a) => [`title:${a[0]}`, 'titles:popular'])
getTitle(id: string) {}

// write — purge every entry carrying the tag, after success
@InvalidateTags((r, a) => [`title:${a[0]}`, 'titles:popular'])
updateTitle(id: string, dto: Dto) {}
```

```text
lookup:   by key   -> getTitle:{"a":[42]}
purge:    by tag   -> SMEMBERS title:42 -> UNLINK each key
```

**Derive the read's tag and the write's purge tag from the same value.** Here both use `args[0]`, so the
strings are identical by construction. When the read has no argument carrying the id (a
`getViewerDashboard()`-style method), the read must fall back to `result.id` — then the write has to
produce that same string, including its type: `title:${42}` and `title:${'42'}` are different tags, and
a number/ObjectId `id` on one side against a string on the other is a purge that silently misses.

Why it is right: the value is found by its key, the tag is a `string[]` the engine can index, and the
purge tag is derived from the same value as the attach tag, so a write cannot leave a stale entry
behind.

Reference: [mercurius-cache references](https://github.com/mercurius-js/cache)
