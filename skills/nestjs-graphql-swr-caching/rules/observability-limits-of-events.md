---
title: Know What the Engine Cannot Report
impact: MEDIUM
impactDescription: stale-served and entry age are not events you get for free
tags: observability, stale, Age, limits
---

## Know What the Engine Cannot Report

**Impact: MEDIUM (stale-served and entry age are not events you get for free)**

The engine emits **`onHit`, `onMiss`, `onDedupe`, `onError`**. It does **not** emit a "served stale"
callback, and it does **not** expose an entry's age. So you cannot honestly publish:

- the `stale` outcome as a first-class event,
- an accurate `X-Cache: STALE` distinction from `HIT`,
- an `Age` header,

**from the engine's callbacks alone.** Either instrument it yourself, or stop claiming it.

Pick one:

1. **Instrument yourself.** Record your own write timestamp and derive age, and treat "past `ttl` but
   inside `ttl + swr`" as stale. That means a thin wrapper around the client that stores
   `{ value, writtenAt }` — only worth it if `Age`/stale ratio are real requirements.
2. **Report only what is real.** Emit `hit` / `miss` / `dedupe` / `bypass` / `error`, and report the
   `dedupe` count as the single-flight metric instead of "stale_served".

`onDedupe` means **a concurrent duplicate request was collapsed into one load** — it is single-flight,
not SWR revalidation. It says nothing about how many entries were served while revalidating.

**Incorrect (a spec the engine cannot satisfy):**

```typescript
onStale: () => emit({ outcome: 'stale' }),   // no such hook
res.setHeader('Age', event.ageMs);           // ageMs is never populated by the engine
```

Why it is wrong: `onStale` does not exist and `ageMs` is always undefined, so the header and the
`stale` metric silently read as zero forever.

**Correct (state the real outcomes and instrument deliberately if you need more):**

```typescript
// honest event set from engine hooks
onHit: () => emit({ outcome: 'hit' }),
onMiss: () => emit({ outcome: 'miss' }),
onDedupe: () => emit({ outcome: 'dedupe', deduped: true }),
onError: () => emit({ outcome: 'error' }),
// stale-served / Age: only if you wrap the client with your own { value, writtenAt }
```

Why it is right: the dashboard reflects what the system actually reports, and any extra signal
(`Age`, stale ratio) is produced deliberately rather than assumed.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe)
