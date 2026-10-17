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
@Cacheable({ ttl: 60, swr: 300 })
@CacheTag((r) => [`title:${r.id}`, 'titles:popular'])
getTitle(id: string) {}

// write — purge every entry carrying the tag, after success
@InvalidateTags((r, a) => [`title:${a[0]}`, 'titles:popular'])
updateTitle(id: string, dto: Dto) {}
```

```text
lookup:   by key   -> cache:TitlesService.getTitle:{id:42}
purge:    by tag   -> SMEMBERS title:42 -> UNLINK each key
```

Why it is right: the value is found by its key, and the tag is used only to find which keys to
delete when the underlying data changes.

Reference: [mercurius-cache references](https://github.com/mercurius-js/cache)
