---
title: Invalidate Only After a Successful Write
impact: HIGH
impactDescription: a failed write must never drop a still-valid entry
tags: InvalidateTags, mutations, tags
---

## Invalidate Only After a Successful Write

**Impact: HIGH (a failed write must never drop a still-valid entry)**

`@InvalidateTags` runs **only after the method returns successfully**. If the write throws, no purge
happens, so a failed write never drops a still-valid entry. Purge in the module that performs the
write (the data owner), not somewhere far away.

**Incorrect (purge before the write; and/or purge on failure):**

```typescript
async updateTitle(id: string, dto: Dto) {
  await this.cache.invalidateAll([`title:${id}`]); // dropped even if the write then fails
  return this.repo.update(id, dto);
}
```

Why it is wrong: the entry is dropped before the write is known to succeed (and may be repopulated
with the old value by an in-flight read), so a failed write needlessly loses a valid entry.

**Correct (decorator runs after success; purge where the write happens):**

```typescript
// the write method — nothing to remember, runs only on success
@InvalidateTags((r, a) => [`title:${a.id}`])
updateTitle(id: string, dto: Dto) { return this.repo.update(id, dto); }

// a write that also changes a shared list must purge that tag too
@InvalidateTags((r, a) => [`title:${a.id}`, 'titles:popular'])
publishTitle(id: string) { return this.repo.publish(id); }
```

Why it is right: the purge is declarative, fires only on success, and lives with the write that
changes the data.

Also: a durable write + a non-durable purge can desync (write commits, purge fails → stale until
`ttl + swr`). If that window is unacceptable, either make the purge retryable or treat the hard TTL as
the backstop by design.

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)
