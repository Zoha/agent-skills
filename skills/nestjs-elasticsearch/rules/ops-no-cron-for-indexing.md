---
title: Never Schedule Indexing with an In-Process Timer
impact: HIGH
impactDescription: "no idle polling; one worker across all instances"
tags: ops, scheduling, queues, multi-instance
---

## Never Schedule Indexing with an In-Process Timer

**Impact: HIGH** — no idle polling; one worker across all instances

`@Interval` and `@Cron` run inside each application process, so with N instances the timer fires N
times — duplicated work and races — and a fixed interval runs even when there is nothing to index.
Schedule periodic search work with a BullMQ job scheduler, which lives in Redis and is processed by
exactly one worker. Prefer scheduling on demand (a debounced job) over polling at all.

**Incorrect (an interval in every instance, ticking when idle):**

```typescript
@Injectable()
export class SearchFlushJob {
  @Interval(1000) // every instance runs this; duplicates and races across N instances
  async flush(): Promise<void> {
    const ids = await this.redis.spop('search:dirty:posts', 1000);
    if (ids.length) await this.reindex.enqueueMany(ids);
  }
}
```

Why it is wrong: each replica executes the timer, so the same flush runs N times, and it ticks every
second whether or not there is work.

**Correct (a BullMQ scheduler — one runner, set once):**

```typescript
// SearchIndexRegistry.ensure() — idempotent across restarts and instances
await this.queue.upsertJobScheduler(
  `sweep:${def.alias}`,
  { every: 120_000 },                          // every two minutes, per feature
  { name: 'sweep-index', data: { alias: def.alias } },
);

// common/search/search-reindex.processor.ts — processed by exactly one worker
@Process('sweep-index')
async sweep(job: Job<{ alias: string }>): Promise<void> {
  const repo = this.registry.repository(job.data.alias);
  const since = await this.watermark.get(job.data.alias);
  const ids = await repo.findChangedSince(since, 1000);
  if (ids.length) await repo.enqueueMany(ids);
  await this.watermark.set(job.data.alias, new Date());
}
```

Why it is right: `upsertJobScheduler` is idempotent, the job lives in Redis and is fetched by one
worker, and a sweep with nothing to do is one query, not a timer firing forever.

When a timer is genuinely local to one node — a cache warm-up with no shared state — `@Interval` is
fine; anything that indexes shared data is not. The per-feature two-minute sweep is also the safety
net that catches changes made outside the app (a direct MongoDB write, another service), because it
re-reads documents changed since the last watermark regardless of who changed them.

Reference: [BullMQ — Job schedulers](https://docs.bullmq.io/guide/job-schedulers) | [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)
