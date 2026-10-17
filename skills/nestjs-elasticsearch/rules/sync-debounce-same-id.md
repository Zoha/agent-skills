---
title: Debounce Same-Id Bursts
impact: CRITICAL
impactDescription: "1,000 changes to one doc -> 1 index job"
tags: sync, queues, debounce, deduplication
---

## Debounce Same-Id Bursts

**Impact: CRITICAL** — 1,000 changes to one doc → 1 index job

A hot document — a post accruing views, a counter incremented in a loop — can emit hundreds of
"changed" events per second. Enqueue with a stable `jobId` and a short `delay` so duplicates
collapse into one job per id per window, and an idle system schedules nothing.

**Incorrect (one job per event):**

```typescript
// 1,000 events on the same post -> 1,000 jobs -> 1,000 index operations
@OnEvent('post.viewed')
async onViewed(e: { id: string }): Promise<void> {
  await this.queue.add('index-one', { alias: 'posts', id: e.id });
}
```

Why it is wrong: the same document is fetched and re-indexed a thousand times in a second, wasting
Elasticsearch capacity on a burst that changes nothing after the first write.

**Correct (dedupe by id, debounce with a delay):**

```typescript
// common/search/search.repository.ts (base)
async enqueueIndex(id: string): Promise<void> {
  await this.queue.add('index-one', { alias: this.index, id }, {
    jobId: `${this.index}:${id}`,  // same-id duplicates while pending are ignored
    delay: 500,                     // debounce window (use 120_000 for a longer quiet period)
    removeOnComplete: true,
    removeOnFail: true,
  });
}
```

Why it is right: `jobId` collapses same-id bursts into a single pending job, the delay widens the
window, and `removeOnComplete` frees the id so the next window can schedule again.

The longer quiet period (mean "wait until the document has been stable for N minutes") is the same
call with a larger `delay` — for example `delay: 120_000` for two minutes. When many *distinct* ids
change at once, prefer one batched job (`enqueueMany`) over per-id jobs; see `sync-bulk-index`.

Reference: [BullMQ — Job ids and deduplication](https://docs.bullmq.io/guide/jobs/job-ids)
