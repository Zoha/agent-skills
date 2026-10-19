---
title: Use Durable Objects, Not KV, for Exact Counters
impact: MEDIUM-HIGH
impactDescription: KV is eventually consistent, so a counter built on it is wrong
tags: cloudflare, durable-objects, kv, sliding-window, consistency
---

## Use Durable Objects, Not KV, for Exact Counters

**Impact: MEDIUM-HIGH (KV is eventually consistent, so a counter built on it is wrong)**

A rate-limit counter is a read-modify-write on a single value, and it must be correct. Cloudflare KV is
**eventually consistent** — a value written in one location may take up to a minute to propagate — so
two requests in different colos read a stale count and both think the caller is under the limit. KV is a
cache, not a counter. Cloudflare's own guidance is to build reliable rate limiting on **Durable
Objects**, which are consistent.

Correct tool per requirement:

| Requirement | Tool |
|---|---|
| Cheap, approximate, sloppy-tolerant flood limit | Workers Rate Limiting binding / rate limiting rules |
| Must-be-exact per-key limit (login, payments, quota) | **Durable Object**, one object per key |

**Incorrect (a KV-backed counter that silently under-counts):**

```typescript
const key = `rl:${userId}`;
const hits = Number((await KV.get(key)) ?? 0) + 1;   // stale reads across colos -> wrong count
await KV.put(key, String(hits), { expirationTtl: 60 });
if (hits > 100) return new Response('too many', { status: 429 });
```

Why it is wrong: KV trades consistency for global read speed, so the increment is not atomic and not
globally current — the limit leaks under exactly the concurrent load it exists to stop.

**Correct (one Durable Object per key, serialized sliding window):**

```typescript
export class RateLimiter {
  constructor(private state: DurableObjectState) {}
  async limit(key: string, windowMs: number, max: number): Promise<boolean> {
    // A named DO has exactly one instance, so requests are handled sequentially:
    // read-modify-write is safe and globally correct.
    const now = Date.now();
    const hits: number[] = (await this.state.storage.get('hits')) ?? [];
    const recent = hits.filter((t) => now - t < windowMs);
    if (recent.length >= max) return false;
    recent.push(now);
    await this.state.storage.put('hits', recent);
    return true;
  }
}
```

```typescript
// the Worker routes to the object named by the key
const id = env.RATE_LIMITER.idFromName(`user:${userId}`);
const ok = await env.RATE_LIMITER.get(id).limit(`user:${userId}`, 60_000, 100);
```

Why it is right: the DO's single instance serializes access, so the counter is globally exact, and the
approximate binding is reserved for the routes that can tolerate approximation.

Rules of thumb:

- **Never let the limiter be slower or less reliable than the thing it protects.** A DO adds a hop and
  cost; use it only where exactness matters, and the cheap binding everywhere else.
- **One object per key, not one global object.** A single object for all users serializes every check in
  one place and is a hotspot; naming the object by the key puts the check near the caller and keeps it
  parallel.
- **DOs are one implementation of "one exact counter".** The origin-side equivalent is a single Redis
  key with `INCR` (`setup-storage`) — the principle is the same: one atomic place per key.
- **A DO's state can hibernate; a short window counter should persist** so an eviction does not reset the
  count (which would be a silent bypass).

Reference: [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) | [Cloudflare Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
