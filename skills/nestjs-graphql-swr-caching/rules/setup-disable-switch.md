---
title: Ship One Config Switch That Bypasses the Service-Level Cache
impact: MEDIUM-HIGH
impactDescription: an off switch that does not break the file-layout boundary or lean on ttl: 0
tags: dev, kill-switch, enabled, config, bypass, noop
---

## Ship One Config Switch That Bypasses the Service-Level Cache

**Impact: MEDIUM-HIGH (an off switch that does not break the file-layout boundary or lean on `ttl: 0`)**

You need to turn caching off without deleting annotations: local development (a warm cache hides the
stale-data bug you are hunting), CI (exercise the uncached path), and an incident (the cache is serving
something wrong and you want out now). One flag covers all three — `cache.enabled` (env
`CACHE_ENABLED`, default `true`). When it is `false`, a decorated call is a **full bypass**: no read, no
write, no dedupe, no tag purge. The method runs exactly as it would with no cache at all.

Implement it by **swapping the `CACHE_CLIENT` implementation at the composition root**, not by teaching
the decorators about the flag. The wrapper in `setup-decorator-runtime` reaches the cache only through
the injected `this.cache`, so a passthrough client needs **zero** changes to the decorators — and
`common/` never has to import `infra/`, which `setup-file-placement` forbids.

**Incorrect (the flag read where the decorator lives, or `ttl: 0` mistaken for "off"):**

```typescript
// common/decorators/cache.decorators.ts
import { cacheEnabled } from '../../infra/cache/cache.config';  // common -> infra: violates the boundary
...
if (!cacheEnabled()) return original.apply(this, args);         // a boot-time flag on every call's hot path

// or, treating a zero TTL as the off switch:
createCache({ ttl: 0 });   // dedupe-only (setup-engine-choice): storage + references stay wired, and
                           // concurrent identical reads still collapse into one call
```

Why it is wrong: the import inverts the one boundary the file layout exists to enforce, the flag is
re-read on every call, and `ttl: 0` is not "off" — it is "store nothing but still dedupe", so dev sees
collapsed calls it would never see uncached.

**Correct (the switch swaps the provider; nothing above it branches on the flag):**

```typescript
// infra/cache/cache.types.ts — the flag is part of the module options
export interface CacheModuleOptions {
  enabled: boolean; // OFF -> every @Cacheable/@InvalidateTags call bypasses to the source
  driver: 'memory' | 'redis';
  redisUrl?: string;
  ttl: number;      // seconds
  swr: number;      // seconds
}

// infra/cache/cache.providers.ts
// The passthrough satisfies the same port the engine does, so no caller tests `enabled`:
//   define(name, options, fn) + client[name](arg)   -> the decorators (setup-decorator-runtime)
//   invalidateAll(tags)                             -> @InvalidateTags
//   get / set / clear                               -> the CacheService (policy-service-escape-hatch)
export function createNoopCache(): Cache {
  const client: any = {
    define(name: string, _options: unknown, fn: (...a: any[]) => Promise<unknown>) {
      client[name] = (...args: unknown[]) => fn(...args); // the same lazy registration point the engine uses
    },
    async invalidateAll() {},                 // nothing is stored -> nothing to purge
    async clear() {},
    async get() { return undefined; },        // every read is a miss...
    async set() {},
  };
  return client as Cache;
}

export function buildCacheClient(opts: CacheModuleOptions, logger: Logger): Cache {
  if (!opts.enabled) {
    // one boot-time tripwire: a disabled cache must be loud, never mistaken for a cold cache
    logger.warn('caching DISABLED (cache.enabled=false) — every cached call bypasses to the source');
    return createNoopCache();                 // no redis connection, no storage, no GC timers
  }
  return createCache(buildCacheOptions(opts)); // redis + references + GC only when enabled
}

// infra/cache/cache.providers.ts — the provider is the one place the flag is read
{
  provide: CACHE_CLIENT,
  inject: [MODULE_OPTIONS_TOKEN],
  useFactory: (opts: CacheModuleOptions) => buildCacheClient(opts, new Logger('CacheModule')),
}
```

Why it is right: the decorators, `@CacheTag`, `@InvalidateTags`, and the `common/`–`infra/` boundary
stay untouched; the switch is one typed value in the module options (`setup-module-wiring`); and the
disabled path also skips the Redis client and the GC timers (`setup-storage-and-invalidation`), so dev
needs no Redis at all.

**Resolve it once, at boot.** `cache.enabled` comes from typed config like every other option:

```typescript
// config/cache.config.ts
export default registerAs('cache', () => ({
  enabled: process.env.CACHE_ENABLED !== 'false', // default ON; .env.development sets it false
  // …driver, redisUrl, ttl, swr
}));
```

- **Boot-time, not per-request.** A dev/ops switch is a deployment decision. A per-request toggle is a
  different feature and belongs to the layer that supports it — Envelop's `enabled`, mercurius' `skip`.
- **Default on, but refuse in production.** Assert `enabled === true` when `NODE_ENV === 'production'`
  (a validation-schema rule, or an explicit throw) rather than letting a stray `CACHE_ENABLED=false`
  quietly disable a production cache.
- **`NODE_ENV === 'test'`** is a legitimate place to default it off so unit tests exercise the uncached
  path — make that a deliberate, visible line in config, not an implicit magic default.

**This switch covers the service-level layer only.** The opt-in extras are gated where they are
configured, and must be turned off separately: do not register Apollo's `responseCachePlugin`
(`driver-apollo-response-cache`), pass `enabled: () => false` to Envelop
(`driver-envelop-response-cache`), `skip: () => true` on `mercurius-cache` policies
(`driver-mercurius-cache`), and omit the CDN `Cache-Control` SWR directives (`driver-cdn-transport`).

**Observability while disabled.** The engine never runs, so it emits no `hit`/`miss`/`dedupe` events.
The boot-time warning above is the signal; the per-request trace reports `BYPASS` from the flag rather
than from an empty event list (`observability-per-request-trace`).

**Cost, stated plainly.** With the cache off you no longer exercise key derivation, `@CacheTag`, or
`@InvalidateTags` — a tag typo that only misbehaves when the cache is live will not surface in dev. If
you want the dedupe/`references` code paths kept warm during development, that is what a zero `ttl`
gives you (dedupe-only, `setup-engine-choice`); use it deliberately, and keep `enabled` as the only
thing called "off".

Reference: [NestJS Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules) | [NestJS Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
