---
title: Emit Structured Cache Events, Not Log Strings
impact: MEDIUM
impactDescription: every hit/miss/dedupe decision becomes queryable data
tags: observability, events, CacheEvent, outcome
---

## Emit Structured Cache Events, Not Log Strings

**Impact: MEDIUM (every hit/miss/dedupe decision becomes queryable data)**

Emit one structured event per decision and push it into the request's context. Do not log formatted
strings — you cannot aggregate them, and the per-request trace depends on the shape.

```typescript
// Only outcomes the engine can actually report. `stale` is NOT one of them: the engine has no
// stale callback (see observability-limits-of-events). Add `stale` to this union only when you
// wrap the client with your own { value, writtenAt } record.
type CacheOutcome = 'hit' | 'miss' | 'dedupe' | 'bypass' | 'error';

interface CacheEvent {
  layer: 'service' | 'field' | 'operation';
  key: string;                    // readable parts, not a hash
  outcome: CacheOutcome;
  ageMs?: number;                 // set ONLY by your own wrapper; the engine never populates it
  freshMs?: number; swrMs?: number;
  tags?: string[]; scope: 'public' | 'perUser';
  deduped?: boolean;              // proves single-flight worked (onDedupe fired)
  durationMs: number; requestId?: string;
}
```

Wire the engine's hooks to the event stream:

```typescript
const client = createCache({
  ttl, stale: swr, storage,
  onHit:    () => emit({ outcome: 'hit' }),
  onMiss:   () => emit({ outcome: 'miss' }),
  onDedupe: () => emit({ outcome: 'dedupe', deduped: true }),
  onError:  () => emit({ outcome: 'error' }),
});
```

**Incorrect (unparseable log lines):**

```typescript
this.logger.log(`cache hit for title:42 in 3ms`);
```

Why it is wrong: you cannot compute a hit ratio, cannot correlate to a request, and cannot tell a
fresh hit from a stale one.

**Correct (one typed event per decision, carried in request context):**

```typescript
emit({ layer: 'service', key: 'TitlesService.getTitle:{id:42}', outcome: 'hit',
       scope: 'public', freshMs: 60_000, swrMs: 300_000, durationMs: 3, requestId });
```

Why it is right: events are typed and aggregatable, the key is readable (not a hash), and `scope`
and `deduped` are captured so leakage and single-flight are auditable.

Note what the engine does **not** report — see `observability-limits-of-events`.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe)
