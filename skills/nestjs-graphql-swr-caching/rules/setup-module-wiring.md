---
title: Wire the Cache Module Once with forRootAsync
impact: CRITICAL
impactDescription: one configurable module, one client token, registered one time
tags: nestjs, module, forRootAsync, ConfigurableModuleBuilder, di
---

## Wire the Cache Module Once with forRootAsync

**Impact: CRITICAL (one configurable module, one client token, registered one time)**

The caching capability is one Nest module built with `ConfigurableModuleBuilder` (which generates
`forRoot`/`forRootAsync`), exposing a single cache-client provider under a token. It is registered
**once**, in the composition root. Features never construct a client, never read `process.env`, and
never import the driver.

**Incorrect (each feature builds its own client from env):**

```typescript
// modules/users/users.service.ts
const cache = createCache({ ttl: 60, storage: { type: 'redis' } }); // per-feature client
```

Why it is wrong: several clients, several connections, no shared invalidation, config read ad hoc,
and the driver leaks into business code.

**Correct (one module, one token, registered once):**

```typescript
// infra/cache/cache.types.ts
export interface CacheModuleOptions {
  enabled: boolean; // OFF -> full bypass: no read, no write, no dedupe, no purge (setup-disable-switch)
  driver: 'memory' | 'redis';
  redisUrl?: string;
  ttl: number;    // default fresh window, SECONDS
  swr: number;    // default stale window, SECONDS
}

// infra/cache/cache.tokens.ts — the ONE declaration site for every cache token.
// Do not re-declare these in common/ (a common/interfaces file holds the CacheService *port* only).
export const CACHE_CLIENT = Symbol('CACHE_CLIENT');
export const CACHE_SERVICE = Symbol('CACHE_SERVICE');
export const CACHE_REDIS = Symbol('CACHE_REDIS');   // the ioredis client, injected for shutdown/GC

// infra/cache/cache.module.ts
import { ConfigurableModuleBuilder, Global, Module, Inject } from '@nestjs/common';
import { createCache, type Cache } from 'async-cache-dedupe';
import { CACHE_CLIENT, CACHE_SERVICE } from './cache.tokens';

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<CacheModuleOptions>()
    .setClassMethodName('forRoot')   // expose forRoot / forRootAsync
    .build();

@Global()                            // caching is app-wide; see setup-file-placement
@Module({
  providers: [
    {
      provide: CACHE_CLIENT,
      inject: [MODULE_OPTIONS_TOKEN],
      useFactory: (opts: CacheModuleOptions): Cache =>
        buildCacheClient(opts),   // real engine, or a passthrough when enabled=false (setup-disable-switch)
    },
    { provide: CACHE_SERVICE, useClass: CacheService },
  ],
  exports: [CACHE_CLIENT, CACHE_SERVICE],
})
export class CacheModule extends ConfigurableModuleClass {}

// app.module.ts — the composition root wires it from typed config
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [cacheConfig], validationSchema }),
    CacheModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: ConfigService): CacheModuleOptions => ({
        enabled: c.get('cache.enabled'), // the one flag that turns the whole capability off
        driver: c.get('cache.driver'),
        redisUrl: c.get('cache.redisUrl'),
        ttl: c.get('cache.ttl'),   // seconds
        swr: c.get('cache.swr'),   // seconds
      }),
    }),
  ],
})
export class AppModule {}
```

Why it is right: one configurable module, one client token built from validated typed config, and
the composition root is the only place that knows the driver exists.

The options also carry `enabled` — the one flag that turns the capability off, as a passthrough client
rather than a zero TTL. Because it is resolved here, at boot, nothing below the provider ever branches
on it (see `setup-disable-switch`).

Reference: [NestJS Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules) | [NestJS Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
