---
title: Use a Shared Store, Never the Default Memory Store in a Fleet
impact: CRITICAL
impactDescription: with N replicas the real limit becomes N x the configured one
tags: storage, redis, throttler, cluster
---

## Use a Shared Store, Never the Default Memory Store in a Fleet

**Impact: CRITICAL (with N replicas the real limit becomes N x the configured one)**

The throttler's built-in storage is an in-memory map **per process**. Behind a load balancer with N
replicas, a request round-robins across processes, each keeping its own counter, so a configured limit
of 10 behaves as 10 × N and the limit is effectively unenforced. Inject a **shared** `ThrottlerStorage`
— Redis is the default choice — so every replica increments one counter.

**Incorrect (in-memory storage in a horizontally scaled deployment):**

```typescript
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]); // per-process map
// 4 replicas -> a caller gets ~40 requests/min, not 10
```

Why it is wrong: the counter it protects is not shared, so the limit scales with the fleet and the
protection silently weakens exactly when it is needed most.

**Correct (one shared store, injected as the storage):**

```typescript
// infra/rate-limit/rate-limit.storage.ts
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { createClient } from 'redis';

export function buildThrottlerStorage(config: ConfigService): ThrottlerStorageRedisService {
  const client = createClient({ url: config.get<string>('rateLimit.redisUrl') });
  client.connect().catch(() => {});             // see `setup-fail-open` for the failure policy
  return new ThrottlerStorageRedisService(client);
}
```

```typescript
// infra/rate-limit/rate-limit.module.ts
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    throttlers: [{ name: 'long', ttl: 60_000, limit: config.get('rateLimit.long') }],
    storage: buildThrottlerStorage(config),
  }),
});
```

Why it is right: every replica increments the same key, so the limit is global and independent of how
many processes are running.

Two facts to verify against your locked versions before you rely on them (see
`driver-version-pinning`):

- `@nest-lab/throttler-storage-redis` declares `@nestjs/throttler >= 6` as a peer dependency. On
  throttler v5 either upgrade, or implement the `ThrottlerStorage` interface yourself over your
  existing client — its atomic `increment` is the only method that matters.
- Model the counter with `INCR` + `EXPIRE` (a fixed window) or a sorted set (sliding window). A
  shared store is still a network hop on the hot path, which is why the edge layer exists
  (`edge-defense-in-depth`).

Reference: [@nest-lab/throttler-storage-redis](https://www.npmjs.com/package/@nest-lab/throttler-storage-redis) | [Redis INCR](https://redis.io/commands/incr)
