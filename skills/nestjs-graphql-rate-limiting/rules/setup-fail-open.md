---
title: Fail Open When the Counter Store Is Down
impact: CRITICAL
impactDescription: a Redis blip must not become a 500 for every request
tags: fail-open, redis, resilience, storage
---

## Fail Open When the Counter Store Is Down

**Impact: CRITICAL (a Redis blip must not become a 500 for every request)**

A rate limit is a protective layer, not a data source. If the shared counter store is unavailable, an
unhandled rejection from `storage.increment` propagates out of the guard and every request returns a
500 — a cache outage takes the whole API down. Wrap the store so a failure **allows** the request,
logs, and alerts: fail **open**. (Failing closed is a deliberate, documented decision for a security
critical surface — never the accidental default.)

**Incorrect (the store error becomes a request error):**

```typescript
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return req.user?.id ?? req.ip;     // fine
  }
  // increment() throwing reaches the global filter -> 500 for everyone
}
```

Why it is wrong: an outage of the counter store (a Redis restart, a network partition) turns into a
total outage of the API the limiter was meant to protect.

**Correct (a fail-open storage decorator around the real store):**

```typescript
// infra/rate-limit/fail-open.storage.ts
import { ThrottlerStorage, ThrottlerStorageRecord } from '@nestjs/throttler';

@Injectable()
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(FailOpenThrottlerStorage.name);

  constructor(
    private readonly inner: ThrottlerStorage,
    private readonly metrics: RateLimitMetrics,   // see `obs-metrics-and-trace`
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await this.inner.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch (error) {
      // ALLOW the request; never let an infrastructure failure deny service.
      this.logger.error('rate-limit storage unavailable, failing open', { key, error: String(error) });
      this.metrics.increment('rate_limit.storage_errors');
      return { totalHits: 1, timeToExpire: ttl, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
```

```typescript
// infra/rate-limit/rate-limit.module.ts — the guard uses the decorator, not the raw client
ThrottlerModule.forRootAsync({
  inject: [ConfigService, RateLimitMetrics],
  useFactory: (config: ConfigService, metrics: RateLimitMetrics) => ({
    throttlers: [{ name: 'long', ttl: 60_000, limit: config.get('rateLimit.long') }],
    storage: new FailOpenThrottlerStorage(buildThrottlerStorage(config), metrics),
  }),
});
```

Why it is right: an unreachable store degrades to "unlimited but serving", the failure is loud
(`storage_errors` metric + error log) so you can page on it, and the request path stays up.

**State the trade-off plainly.** While failing open the API is unprotected; that is the correct
availability choice for most public APIs but the wrong one for, say, a login endpoint you would rather
take offline than leave unthrottled. Decide per surface, write it down, and alert on the
`storage_errors` counter either way.

Reference: [NestJS Exception filters](https://docs.nestjs.com/exception-filters) | [Redis INCR](https://redis.io/commands/incr)
