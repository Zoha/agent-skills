---
title: Purge Atomically and Cap Tag Cardinality
impact: HIGH
impactDescription: non-atomic purges leave orphans; unbounded tags stall Redis
tags: redis, lua, unlink, cardinality, cluster
---

## Purge Atomically and Cap Tag Cardinality

**Impact: HIGH (non-atomic purges leave orphans; unbounded tags stall Redis)**

The reverse index is `SADD <tag> <cacheKey>` per write; purging is `SMEMBERS` + `UNLINK`. On a single
Redis node, do the resolve-and-delete in **one Lua script** — a concurrent `SADD` between the two
round-trips survives the sweep as a stale orphan. (On Redis Cluster this script needs the slot
alignment described in the cluster notes below.) Guard cardinality, and use `UNLINK` (non-blocking),
never `KEYS` or an unbounded `SCAN`.

**Incorrect (two round-trips; unbounded tag; blocking delete):**

```typescript
const keys = await redis.smembers(`tag:${tag}`);   // a SADD here is lost below
for (const k of keys) await redis.del(k);          // DEL blocks; no cardinality guard
```

Why it is wrong: a write racing the purge leaves an orphan that is never invalidated, and a huge tag
set stalls Redis on a blocking `DEL`.

**Correct (one Lua sweep; cardinality guard; UNLINK):**

```lua
-- infra/cache/lua/purge-tag.lua
local members = redis.call('SMEMBERS', KEYS[1])
for i = 1, #members do redis.call('UNLINK', members[i]) end
redis.call('UNLINK', KEYS[1])
return #members
```

```typescript
const count = await redis.scard(`tag:${tag}`);
if (count > 5_000) throw new Error(`tag ${tag} over cardinality ceiling`); // shard/rotate instead
await redis.eval(purgeTagLua, 1, `tag:${tag}`);
```

Why it is right: on a single node the sweep is atomic, deletes are non-blocking, and a runaway tag is
caught before it stalls Redis.

Cluster notes:

- **A script may only touch keys that hash to the same slot as the keys it declares.** The snippet
  above declares one key (the tag set) but `UNLINK`s members it reads at runtime, so on Redis Cluster
  it fails the cross-slot check unless every member lands in the tag set's slot.
- That alignment does **not** happen by itself: the members are cache keys **the engine names**
  (`TitlesService.getTitle:…`), not keys this rule generates. To make the single-slot sweep work you
  must pin the cache key to the slot yourself — override the key so it begins with the same
  `{tag:…}` hash tag the tag set uses (see `policy-key-derivation`).
- If you cannot pin the key, use a **two-step purge** instead (`SMEMBERS`, then `UNLINK` in bounded
  batches) and accept that a concurrent `SADD` can leave one orphan: re-run the sweep, or let the
  entry's `ttl + swr` retire it. Do not assume the atomic single-slot sweep on a cluster you have not
  verified.
- **Index TTL ≥ longest cache TTL**, else tag sets expire before their keys and purges silently miss.
- Beyond ~5k members, shard the tag or switch to a generation prefix (see
  `invalidation-generation-prefix`).

Reference: [Redis UNLINK](https://redis.io/commands/unlink) | [Redis cluster keyslot](https://redis.io/docs/reference/cluster-spec/)
