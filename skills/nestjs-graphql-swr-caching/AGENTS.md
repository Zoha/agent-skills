# NestJS GraphQL SWR Caching

**Version 2.0.0**
NestJS GraphQL SWR Caching
October 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

Implementation and policy guide for stale-while-revalidate (SWR) caching of GraphQL reads in NestJS (code-first) applications, designed for AI agents and LLMs. Covers the one-time module wiring (a forRootAsync cache module, its tokens, storage, invalidation, and context), the five knobs (key, tag, scope, ttl, swr), the @Cacheable/@CacheTag/@CacheScope/@InvalidateTags decorator surface, where to mount caching (service, field, operation, transport), leak safety (default-public scope, per-caller key dimensions, the no-leak checklist), tag-invalidation mechanics (referencesTTL, atomic purge, cardinality, generation prefixes), observability (structured events, per-request trace, metrics), and the driver reality check across async-cache-dedupe, mercurius-cache, Apollo responseCachePlugin, Envelop, and CDN/APQ.

---

## Table of Contents

1. [One-Time Setup](#1-one-time-setup) — **CRITICAL**
   - 1.1 [Implement the Decorators as Method Wrappers with Stable Names](#11-implement-the-decorators-as-method-wrappers-with-stable-names)
   - 1.2 [Use a Deduplicating Engine, and Count TTL in Seconds](#12-use-a-deduplicating-engine-and-count-ttl-in-seconds)
   - 1.3 [Fail Open, and Never Cache Errors](#13-fail-open-and-never-cache-errors)
   - 1.4 [Place the Capability by Who Imports It](#14-place-the-capability-by-who-imports-it)
   - 1.5 [Read the Caller from AsyncLocalStorage, Not Scope.REQUEST](#15-read-the-caller-from-asynclocalstorage-not-scope-request)
   - 1.6 [Wire the Cache Module Once with forRootAsync](#16-wire-the-cache-module-once-with-forrootasync)
   - 1.7 [Enable Invalidation and Set referencesTTL and GC](#17-enable-invalidation-and-set-referencesttl-and-gc)
2. [Cache Policy](#2-cache-policy) — **CRITICAL**
   - 2.1 [Know the Five Knobs](#21-know-the-five-knobs)
   - 2.2 [Derive the Key Automatically, Never with JSON.stringify](#22-derive-the-key-automatically-never-with-json-stringify)
   - 2.3 [Mount at the Service Level by Default](#23-mount-at-the-service-level-by-default)
   - 2.4 [The Decorators Are the One Writing Pattern](#24-the-decorators-are-the-one-writing-pattern)
   - 2.5 [The Service API Is an Escape Hatch, Not a Second Pattern](#25-the-service-api-is-an-escape-hatch-not-a-second-pattern)
3. [Leak Safety](#3-leak-safety) — **CRITICAL**
   - 3.1 [Scope Defaults to Public — Mark Caller-Varying Reads perUser](#31-scope-defaults-to-public-mark-caller-varying-reads-peruser)
   - 3.2 [Scope Covers the User Only — Every Other Dimension Goes in the Key](#32-scope-covers-the-user-only-every-other-dimension-goes-in-the-key)
   - 3.3 [Run the No-Leak Checklist on Every Cached Read](#33-run-the-no-leak-checklist-on-every-cached-read)
4. [Invalidation](#4-invalidation) — **HIGH**
   - 4.1 [Invalidate Only After a Successful Write](#41-invalidate-only-after-a-successful-write)
   - 4.2 [Purge Atomically and Cap Tag Cardinality](#42-purge-atomically-and-cap-tag-cardinality)
   - 4.3 [Use a Generation Prefix for Huge or Coarse Domains](#43-use-a-generation-prefix-for-huge-or-coarse-domains)
   - 4.4 [Tags Are Purge-Only, Never for Lookup](#44-tags-are-purge-only-never-for-lookup)
5. [Observability](#5-observability) — **MEDIUM**
   - 5.1 [Know What the Engine Cannot Report](#51-know-what-the-engine-cannot-report)
   - 5.2 [Track the Metrics That Prove the Fix, and Test on Outcomes](#52-track-the-metrics-that-prove-the-fix-and-test-on-outcomes)
   - 5.3 [Surface a Per-Request Trace, Dev-Only on GraphQL](#53-surface-a-per-request-trace-dev-only-on-graphql)
   - 5.4 [Emit Structured Cache Events, Not Log Strings](#54-emit-structured-cache-events-not-log-strings)
6. [Drivers](#6-drivers) — **MEDIUM**
   - 6.1 [Option C — Apollo responseCachePlugin (Operation Level, TTL Only)](#61-option-c-apollo-responsecacheplugin-operation-level-ttl-only-)
   - 6.2 [Pick the Field-Level Option from Your Driver](#62-pick-the-field-level-option-from-your-driver)
   - 6.3 [Option A — async-cache-dedupe (Service Level, Transport-Agnostic)](#63-option-a-async-cache-dedupe-service-level-transport-agnostic-)
   - 6.4 [Option E — Transport / CDN SWR (Public Reads Only)](#64-option-e-transport-cdn-swr-public-reads-only-)
   - 6.5 [Option D — Envelop useResponseCache (Not Native to NestJS)](#65-option-d-envelop-useresponsecache-not-native-to-nestjs-)
   - 6.6 [Federation Only — Apollo Router Response Caching](#66-federation-only-apollo-router-response-caching)
   - 6.7 [Option B — mercurius-cache (Field Level, Real SWR)](#67-option-b-mercurius-cache-field-level-real-swr-)
   - 6.8 [Pin Versions — This Area Drifts](#68-pin-versions-this-area-drifts)

---

## 1. One-Time Setup

**Section Impact: CRITICAL**

### 1.1 Implement the Decorators as Method Wrappers with Stable Names

**Impact: CRITICAL** — the service-level decorator cannot be an interceptor

Nest interceptors only run for controller/resolver handlers — **not** for arbitrary service methods.
So `@Cacheable()` on a service method is implemented by wrapping `descriptor.value`. Because a
decorator cannot constructor-inject, it reaches the client by attaching `@Inject(CACHE_CLIENT)` as a
property (the one documented property-injection exception).

Four things break naive implementations:

1. **Key from `target.constructor.name`** — under minification/bundling the class name changes or
   collides, so entries are shared across different methods. Use an explicit, stable name.
2. **Stacking** — `@Cacheable` + `@CacheTag` + `@CacheScope` apply bottom-up; metadata must be
   **merged**, not overwritten.
3. **Registration race** — register `client.define(name, …)` lazily and once; guard concurrent first
   calls.
4. **Context** — the wrapper must preserve `this`/`async` and read the caller from CLS (see
   `setup-identity-context`), never assume a request.

**Incorrect (unstable key + overwritten metadata):**

```typescript
Reflect.defineMetadata(CACHE_SCOPE, scope, descriptor.value); // later decorator overwrites earlier
const name = `${target.constructor.name}.${propertyKey}`;     // minified -> collides
```

Why it is wrong: two decorators on one method clobber each other, and a production build can serve
one method's entries to another.

**Correct (explicit name, merged metadata, guarded registration):**

```typescript
// common/decorators/cache.decorators.ts
export const CACHE_META = Symbol('CACHE_META');

function merge(target: object, key: string | symbol, patch: Partial<CacheMeta>) {
  const current = Reflect.getMetadata(CACHE_META, target, key) ?? {};
  Reflect.defineMetadata(CACHE_META, { ...current, ...patch }, target, key);
}

export function Cacheable<T>(opts: CacheableOptions = {}): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const name = opts.name ?? `${target.constructor.name}.${String(propertyKey)}`; // stable, reviewable
    Inject(CACHE_CLIENT)(target, 'cache');                                         // property exception
    merge(target, propertyKey, { name, ttl: opts.ttl, swr: opts.swr, keyFn: opts.key });

    const original = descriptor.value as (...a: any[]) => Promise<T>;
    descriptor.value = async function (this: any, ...args: any[]) {
      const client: Cache = this.cache;
      const meta = Reflect.getMetadata(CACHE_META, target, propertyKey) as CacheMeta;
      const scope = meta.scope ?? 'public';
      const cls = ClsServiceManager.getClsService();
      const userId = cls?.get<string>('userId');
      if (scope === 'perUser' && !userId) return original.apply(this, args); // anonymous -> bypass

      const arg = { a: args, k: meta.keyFn?.(...args), u: scope === 'perUser' ? userId : undefined };
      if (!(client as any)[meta.name]) {
        (client as any).define(meta.name, { ttl: meta.ttl, stale: meta.swr, references: meta.tagsFn },
          (k: any) => original.apply(this, k.a));
      }
      return (client as any)[meta.name](arg);
    };
  };
}
```

Why it is right: the name is explicit and stable, the three decorators merge into one metadata blob,
registration happens once, and the caller comes from CLS with an anonymous bypass.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [NestJS Interceptors](https://docs.nestjs.com/interceptors)

---

### 1.2 Use a Deduplicating Engine, and Count TTL in Seconds

**Impact: CRITICAL** — SWR without reimplementing single-flight, and no 1000x TTL bug

Back the client with a deduplicating engine — `async-cache-dedupe` is the transport-agnostic default
(`mercurius-cache` is the same engine at the field level). Do not hand-roll the cache envelope unless
you actually need outcomes the engine cannot report (see `observability-limits-of-events`). The engine
gives you, for free: a real `stale` window, **single-flight dedupe**, `references`-based invalidation,
and stable-stringify keys.

Two unit facts that are the single most common implementation bug:

- **`async-cache-dedupe` takes `ttl`/`stale` in SECONDS.**
- `@nestjs/cache-manager`/Keyv and HTTP `Cache-Control` take **milliseconds**.

**Incorrect (hand-rolled envelope + millisecond TTLs):**

```typescript
await redis.set(key, JSON.stringify({ v, soft: now + 60_000, hard: now + 360_000 }));
// no single-flight -> N concurrent misses do N loads; and units are easy to mix
```

Why it is wrong: you reimplement dedupe, stale serving, and invalidation (each a bug surface), and a
seconds/ms mix is a silent 1000x error.

**Correct (engine owns the mechanism; you own the policy):**

```typescript
import { createCache } from 'async-cache-dedupe';

const client = createCache({
  ttl: 60,          // seconds
  stale: 300,       // seconds served after ttl, while revalidating (true SWR)
  storage: { type: 'redis', options: { client: redis, invalidation: true } },
});

// single-flight is built in: concurrent misses for one key -> one loader call
client.define('TitlesService.getTitle', { references: (args, key, result) => [`title:${result.id}`] },
  (id: string) => this.repo.findById(id));
```

Why it is right: SWR, dedupe, and references come from the engine; the units are the engine's
(seconds), and the policy (ttl/swr/tags) is all you write.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe) | [mercurius-cache](https://github.com/mercurius-js/cache)

---

### 1.3 Fail Open, and Never Cache Errors

**Impact: CRITICAL** — a cache/Redis outage must degrade to slow, not to 500

A cache is an optimization; it must never take the request down. Wrap the **read**, the **write**, and
**serialization** in try/catch, treat any failure as a miss, and fall through to the source. The
engine's `onError` hook must emit an event and return — never throw. And an error result must never be
cached.

**Incorrect (cache errors propagate; errors get cached):**

```typescript
const cached = await client.get(key);            // throws on Redis blip -> request fails
if (cached) return cached;
const data = await load();
await client.set(key, data);                     // if data is an error object, it is now cached
```

Why it is wrong: a Redis hiccup becomes a user-facing 500, and a cached error is served until the TTL.

**Correct (fail-open wrapper; only successful results are stored):**

```typescript
function recordEvent(outcome: CacheOutcome, extra?: Partial<CacheEvent>) {
  return (...args: unknown[]) => pushCacheEvent({ outcome, ...extra }); // never throws
}

const client = createCache({
  ttl, stale: swr,
  storage,
  onError: recordEvent('error'),   // emit and continue
});

async function readThrough<T>(name: string, arg: unknown, load: () => Promise<T>): Promise<T> {
  try {
    const hit = await (client as any)[name](arg);
    return hit;
  } catch {
    return load();                 // any cache failure -> go to source
  }
}

// only a resolved, non-error result is cached; a throw leaves the cache untouched
async function load(): Promise<Data> {
  const data = await repo.find();
  if (!data) throw new NotFoundException();      // never store this
  return data;
}
```

Why it is right: every cache interaction degrades to the source on failure, and a rejected loader
never populates an entry.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe) | [NestJS Exception filters](https://docs.nestjs.com/exception-filters)

---

### 1.4 Place the Capability by Who Imports It

**Impact: CRITICAL** — keeps infrastructure out of features and decorators feature-importable

Caching is a **capability** with two halves: an infrastructure half that only the composition root
imports, and a surface half that feature code imports. One rule decides where each file goes:

> A file goes to `infra/` if **only the composition root** imports it; to `common/` if **feature code**
> imports it.

Do not create a flat `src/cache/` folder, and do not invent a `common/<capability>/` folder for file
kinds that already have homes.

**Incorrect (one flat folder features reach into for infrastructure):**

```text
src/cache/
  cache.module.ts          # infrastructure, but sits beside feature-imported decorators
  swr-cache.service.ts
  decorators.ts
```

Why it is wrong: the folder mixes "composition-root-only" with "feature-imported", so a boundary
lint cannot tell them apart — and a feature can now import the driver.

**Correct (split by importer; the module boundary lint enforces it):**

```text
src/
├── config/
│   └── cache.config.ts                # typed namespace (registerAs)
├── infra/
│   └── cache/                         # ONLY the composition root imports this
│       ├── cache.module.ts            # forRootAsync wiring
│       ├── cache.providers.ts         # createCache(...) -> CACHE_CLIENT
│       └── cache.tokens.ts
├── common/
│   ├── decorators/
│   │   └── cache.decorators.ts        # @Cacheable/@CacheTag/@CacheScope/@InvalidateTags
│   ├── interfaces/
│   │   └── cache-service.interface.ts # port + CACHE_SERVICE token
│   ├── services/
│   │   └── cache.service.ts
│   ├── interceptors/
│   │   └── cache-trace.interceptor.ts
│   └── types/
│       └── cache-event.ts
└── app.module.ts                      # imports CacheModule; registers APP_INTERCEPTOR
```

Why it is right: infrastructure stays behind `infra/` (features may import `common/` but never
`infra/`), and the decorators — which feature source files import — live where the boundary rule
permits. This mirrors the canonical layout's `<cache|queue|…>` under `infra/`.

If the file-count scatter is unwanted, collapse the four decorators into the one
`common/decorators/cache.decorators.ts` file shown above (one cohesive API surface). A single
`infra/cache/` folder holding its own `decorators/`/`service/` is only acceptable with a deliberate,
documented lint exception for that path.

Reference: [NestJS Modules](https://docs.nestjs.com/modules#shared-modules)

---

### 1.5 Read the Caller from AsyncLocalStorage, Not Scope.REQUEST

**Impact: CRITICAL** — per-user keying without bubbling request scope through the graph

Service methods rarely take a user argument, and `Scope.REQUEST` bubbles through the whole provider
graph (and breaks the singleton cache client). Populate caller identity once per request with
`nestjs-cls` (AsyncLocalStorage), then read it where the key is built.

- Providers read it via injected `ClsService`.
- **Decorators cannot inject** — read it via `ClsServiceManager.getClsService()`.
- **Background jobs/subscriptions have no request**: pass the id explicitly as a key dimension.
- Identity comes from **verified auth**, never a raw client header.

**Incorrect (request-scoped cache service + unverified header):**

```typescript
@Injectable({ scope: Scope.REQUEST }) // bubbles everywhere; singleton cache client breaks
export class CacheService {
  private user = this.req.headers['x-user-id']; // client-controlled -> identity spoofing
}
```

Why it is wrong: request scope defeats the shared client and single-flight map, and the header is
untrusted, so anyone can read another user's cached entry.

**Correct (CLS populated once from the authenticated user):**

```typescript
// app.module.ts
ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    setup: (cls, req) => {
      cls.set('userId', req.user?.id ?? null);       // req.user comes from the verified JWT
      cls.set('tenantId', req.user?.tenantId ?? null);
      cls.set('locale', req.user?.locale ?? null);
    },
  },
});

// a provider
const userId = this.cls.get<string>('userId');

// inside a decorator wrapper (no DI available)
import { ClsServiceManager } from 'nestjs-cls';
const userId = ClsServiceManager.getClsService().get<string>('userId');

// a BullMQ processor — no request, so the caller passes the id explicitly
@Cacheable({ ttl: 60, swr: 300, key: (a) => ['invoices', a.userId] })
rebuildInvoicesFor(userId: string) {}
```

Why it is right: the cache client stays a singleton, identity is set once from verified auth, and the
one context that has no request passes the id as an explicit key dimension.

Reference: [NestJS Async Local Storage](https://docs.nestjs.com/recipes/async-local-storage) | [nestjs-cls](https://github.com/Papooch/nestjs-cls)

---

### 1.6 Wire the Cache Module Once with forRootAsync

**Impact: CRITICAL** — one configurable module, one client token, registered one time

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
  driver: 'memory' | 'redis';
  redisUrl?: string;
  ttl: number;    // default fresh window, SECONDS
  swr: number;    // default stale window, SECONDS
}

// infra/cache/cache.tokens.ts
export const CACHE_CLIENT = Symbol('CACHE_CLIENT');
export const CACHE_SERVICE = Symbol('CACHE_SERVICE');

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
        createCache(buildCacheOptions(opts)),
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

Reference: [NestJS Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules) | [NestJS Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)

---

### 1.7 Enable Invalidation and Set referencesTTL and GC

**Impact: CRITICAL** — tag invalidation is OFF by default and silently misses without this

Explicit invalidation is **disabled by default** in the storage options. Enable it, set
`referencesTTL` to at least the longest hard expiry (`ttl + swr`), and schedule garbage collection.
Skip any of the three and tag purges become no-ops or leak references forever.

- **memory** storage is per-process and size-capped (default 1024 *per definition*); it has **no GC**.
  Use it only for single-process, non-shared data.
- **redis** storage is required for a shared cache, and references must be garbage-collected
  (`lazy` frequently, `strict` occasionally).

**Incorrect (invalidation left off; references TTL shorter than entries):**

```typescript
storage: { type: 'redis', options: { client: redis } } // invalidation NOT enabled -> tags do nothing
```

Why it is wrong: `@InvalidateTags` runs but purges nothing, and stale entries live until their TTL.

**Correct (enable invalidation, outlive entries, collect garbage):**

```typescript
const hardSeconds = ttl + swr; // ttl = fresh, swr = stale window

const client = createCache({
  ttl,
  stale: swr,
  storage: {
    type: 'redis',
    options: {
      client: redis,
      invalidation: { referencesTTL: hardSeconds }, // >= longest hard expiry, or refs expire first
    },
  },
});

// infra/cache/cache.gc.ts — keep references from accumulating
const storage = createStorage('redis', { client: redis, invalidation: true });
setInterval(() => storage.gc('lazy', { lazy: { chunk: 200 } }), 60_000).unref();
setInterval(() => storage.gc('strict', { chunk: 250 }), 10 * 60_000).unref();
```

```typescript
// infra/cache/cache.module.ts — close the Redis connection on shutdown
export class CacheModule implements OnApplicationShutdown {
  constructor(@Inject(CACHE_REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown() { await this.redis.quit().catch(() => {}); }
}
```

Why it is right: invalidation actually fires, references live at least as long as the entries they
guard, and expired references are pruned instead of slowing every write.

Reference: [async-cache-dedupe invalidation + gc](https://github.com/mcollina/async-cache-dedupe)

---

## 2. Cache Policy

**Section Impact: CRITICAL**

### 2.1 Know the Five Knobs

**Impact: CRITICAL** — one vocabulary for every caching decision

Every caching decision is expressed with the same five knobs. Name them consistently.

| Knob | Answers | Notes |
|---|---|---|
| **key** | "Which single value is this?" | Where it's stored. Must encode **every** result-varying input (user, tenant, locale). 1:1. |
| **tag** | "What to purge when X changes?" | Reverse index for invalidation. **Not** for lookup. A value can carry many tags. |
| **scope** | "May callers share this?" | `public` (**default**) = byte-identical for everyone; `perUser` = caller-scoped. |
| **ttl** | "How long is it *fresh*?" | In-window: served as-is, no work. |
| **swr** | "After fresh, how long may I serve it *while refreshing*?" | Served instantly + background refresh. **Hard expiry = ttl + swr.** |

```
t=0 ─────────── ttl ────────────── ttl+swr ─────────────►
  ███ FRESH ███   ▒▒▒ STALE (served + bg refresh) ▒▒▒   ✗ GONE
  served instantly   served instantly, one deduped refresh   next call BLOCKS (miss)
```

`swr` removes the revalidation cliff — but only with **single-flight/dedupe**, so N concurrent stale
reads trigger **one** refresh, not N.

Scope ⇄ key, mechanically:

```
public   →  cache:svc.getTitle:{id:42}          ← everyone reads this
perUser  →  cache:svc.getTitle:u:123:{id:42}    ← only user 123 reads this
```

**Incorrect (TTL-only, unnamed windows):**

```typescript
@Cacheable({ ttl: 360 }) // 360 what? and a blocking miss at expiry
```

Why it is wrong: a single number cannot express "fresh" vs "serve-while-refreshing", so every expiry
is a blocking miss and you get the stampede you were trying to remove.

**Correct (name the two windows):**

```typescript
@Cacheable({ ttl: 60, swr: 300 }) // fresh for 60s, then served stale for 300s while one refresh runs
```

Why it is right: `ttl` and `swr` are separate, named, and the hard expiry (`ttl + swr`) is explicit.

Reference: [RFC 5861 stale-while-revalidate](https://www.rfc-editor.org/rfc/rfc5861)

---

### 2.2 Derive the Key Automatically, Never with JSON.stringify

**Impact: HIGH** — stable, collision-free keys without per-callsite hand-rolling

The engine derives the key as `Class.method` + a **stable** serialization of the arguments
(`safe-stable-stringify`: key order independent, circular-safe). Override `key` only to add extra
dimensions. Never use `JSON.stringify` — its key order follows insertion order, so the same logical
input can produce different keys and silently miss (or, worse, collide).

**Incorrect (unstable serialization; hand-built keys everywhere):**

```typescript
const key = `title:${JSON.stringify(dto)}`; // {a:1,b:2} and {b:2,a:1} hash differently
```

Why it is wrong: object key order changes the key, so the cache misses arbitrarily and entries
fragment.

**Correct (auto-derived, with an explicit override only for extra dimensions):**

```typescript
// auto: "TitlesService.getTitle:{id:42}" via safe-stable-stringify(args)
@Cacheable({ ttl: 60, swr: 300 })
getTitle(id: string) {}

// override ONLY to add a dimension the args do not carry (e.g. locale, or a job with no request)
@Cacheable({ ttl: 60, swr: 300, key: (a, ctx) => ['title', a.id, ctx.locale] })
getTitle(id: string) {}
```

Why it is right: the default key is stable and named after the method, and an override is a visible,
reviewable decision rather than the norm.

Also: the key must be **readable in events, not hashed** (see `observability-structured-events`), and
must never contain secrets.

Reference: [safe-stable-stringify](https://github.com/BridgeAR/safe-stable-stringify)

---

### 2.3 Mount at the Service Level by Default

**Impact: HIGH** — cache the expensive unit of work, escalate only when measured

| Layer | Mount | Mechanism | Real SWR? |
|---|---|---|---|
| **Service method** (default) | `@Cacheable` on a provider | your cache layer / `async-cache-dedupe` | ✅ `stale` |
| **Field/resolver** (opt-in) | wrap resolver / decorator | same layer, `ttl`+`swr` | ✅ |
| **Operation result** | Apollo `responseCachePlugin` | TTL-only, keyed by op hash + `sessionId` | ❌ |
| **Transport / CDN** | APQ + `GET` | `Cache-Control: s-maxage, stale-while-revalidate` | ✅ (RFC 5861) |

**All five knobs are identical at service and field level.** Only two things differ:

- **Identity source** — service methods read the user from request context (CLS), not usually an
  argument. Background jobs have **no user**: pass the id explicitly as a key dimension.
- **Operation/transport layers don't exist at service level.** Apollo's response cache and CDN
  headers are transport concerns, and neither supports tag invalidation.

**Incorrect (starting at the operation layer, and losing dedupe):**

```typescript
// register Apollo responseCachePlugin and call it done
plugins: [responseCachePlugin()] // TTL-only, no SWR, no tags, defeats DataLoader
```

Why it is wrong: the expensive service call still runs once per operation, there is no SWR, and no
way to invalidate on write.

**Correct (cache the service method; escalate only when measured):**

```typescript
@Injectable()
export class TitlesService {
  @Cacheable({ ttl: 60, swr: 300 })
  @CacheTag((r) => `title:${r.id}`)
  getTitle(id: string) { return this.repo.findById(id); } // the expensive unit, cached once
}
```

Why it is right: the DB/upstream work is cached at the point it happens, dedupe covers every caller
of the method, and the resolver stays thin.

Reference: [Apollo Server caching](https://github.com/apollographql/apollo-server)

---

### 2.4 The Decorators Are the One Writing Pattern

**Impact: CRITICAL** — one reviewable shape; no per-callsite policy drift

Exactly **one way to write each thing**:

- **Cache config** → `@Cacheable({ key, ttl, swr })` — the only place for key/ttl/swr.
- **Tags** → `@CacheTag(...)` — always, never an option on `@Cacheable`.
- **Scope** → `@CacheScope(...)` — always, never an option on `@Cacheable`; only to mark a caller-scoped read.
- **Invalidation** → `@InvalidateTags(...)` on the write method.

**Incorrect (scope/tags smuggled into the config object; inconsistent shapes):**

```typescript
@Cacheable({ ttl: 60, swr: 300, tags: ['title:42'], scope: 'perUser' })
getViewer(id: string) {}
```

Why it is wrong: review must read every option to find the leak-prone ones, and the shape differs
between methods so nothing is scannable.

**Correct (one decorator per concern, stackable, order-independent):**

```typescript
// public (default) — one entry shared by every caller
@Cacheable({ ttl: 60, swr: 300, key: (a) => ['title', a.id] })
@CacheTag((r) => `title:${r.id}`)   // invalidation refs (stackable)
getTitle(id: string) {}

// caller-scoped — explicit, because the result varies per caller
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getViewer(id: string) {}

// invalidate on write — runs only AFTER the method succeeds
@InvalidateTags((r, a) => [`title:${a.id}`])
updateTitle(id: string, dto: Dto) {}
```

Why it is right: the leak-prone line (`@CacheScope('perUser')`) is a separate, greppable decorator,
and every method uses the same three shapes.

Rules:

- `@Cacheable` takes only `key`, `ttl`, `swr`. Never put `scope` or `tags` inside it.
- `@InvalidateTags` fires **after success** only (see `invalidation-after-success`).
- Tags are optional — use them when you need revocation, otherwise let `ttl` expire the entry.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators)

---

### 2.5 The Service API Is an Escape Hatch, Not a Second Pattern

**Impact: MEDIUM** — keeps policy visible at the definition site

A programmatic `CacheService` exists for policies that **cannot** be expressed at decorator time —
keys computed from a runtime value, or call sites that are not providers. It is **not** a second
writing pattern: the decorators are the one way, and they are always preferred for readability.

**Incorrect (reaching for the service by default):**

```typescript
async getTitle(id: string) {
  return this.cache.wrap({ key: `title:${id}`, ttl: 60, swr: 300, load: () => this.repo.find(id) });
}
```

Why it is wrong: the policy is buried in the method body, is not greppable, and drifts per call site.

**Correct (decorator by default; service only when the policy is truly runtime-computed):**

```typescript
// default: the policy is on the method, visible in review
@Cacheable({ ttl: 60, swr: 300 })
getTitle(id: string) {}

// escape hatch: the TTL genuinely depends on a runtime decision
async getFeed(segment: string) {
  const policy = await this.policies.forSegment(segment); // runtime-computed
  return this.cache.wrap({ key: ['feed', segment], ...policy, load: () => this.repo.feed(segment) });
}
```

Why it is right: the common case stays declarative and greppable, and the service is reserved for
policies that genuinely cannot be written as a decorator.

Reference: [NestJS Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)

---

## 3. Leak Safety

**Section Impact: CRITICAL**

### 3.1 Scope Defaults to Public — Mark Caller-Varying Reads perUser

**Impact: CRITICAL** — the default is a leak by design; the decorator is the review line

A cache entry is shared by **every** caller unless you say otherwise. That is only correct when the
result is byte-identical for all of them. Any result that varies by caller **must** carry
`@CacheScope('perUser')`; that decorator is the line a reviewer scrutinizes.

- Anonymous `perUser` → **bypass** the cache (never key under an empty identity).
- The user identity comes from **verified auth**, never a raw client header.

**Incorrect (a caller-varying read left public):**

```typescript
@Cacheable({ ttl: 60, swr: 300 })   // no @CacheScope -> public
getViewerDashboard() { return this.repo.dashboardFor(this.cls.get('userId')); }
```

Why it is wrong: the first caller's dashboard is cached and served to everyone — a data leak, not a
slow cache.

**Correct (explicit perUser, with an anonymous bypass):**

```typescript
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getViewerDashboard() { return this.repo.dashboardFor(this.cls.get('userId')); }

// public is only correct when the result is identical for every caller
@Cacheable({ ttl: 60, swr: 300 })
getPopularTitles() { return this.repo.popular(); }
```

```text
public   →  dashboard:{id}            ← served to everyone (WRONG when it varies)
perUser  →  dashboard:u:123:{id}      ← only user 123 reads this
```

Why it is right: the caller-scoped read carries the explicit decorator, and the anonymous case
bypasses instead of colliding under one empty key.

Reference: [NestJS Guards](https://docs.nestjs.com/guards)

---

### 3.2 Scope Covers the User Only — Every Other Dimension Goes in the Key

**Impact: CRITICAL** — scope is not a substitute for key dimensions

`@CacheScope` answers exactly one question: **may callers share this entry?** It selects between
`public` and *the requesting user's* segment. It does **not** encode tenant, locale, role/scope,
currency, feature-flag cohort, or any other dimension the result varies by.

Confusing "scope" with "which identity segments enter the key" is how a `perUser` entry still leaks
across tenants. Every result-varying dimension — user **and** everything else — must be present in the
final key: the user via `@CacheScope('perUser')`, the rest via `@Cacheable({ key })`.

**Incorrect (perUser, but tenant/locale missing from the key):**

```typescript
// two tenants share cache:TitlesService.getTitle:u:123:{id:42}
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getTitle(id: string) { return this.repo.findById(id); } // tenant-scoped in the DB, not in the key
```

Why it is wrong: user 123 has the same key in every tenant, so tenant A's row is served in tenant B.

**Correct (user via scope; every other dimension as an explicit key part):**

```typescript
@Cacheable({
  ttl: 60,
  swr: 300,
  key: (a, ctx) => ['title', a.id, ctx.tenantId, ctx.locale, ctx.pricingCohort],
})
@CacheScope('perUser')
getTitle(id: string) {}

// -> cache:TitlesService.getTitle:u:123:t:acme:l:en-US:cohort:B:{id:42}
```

Why it is right: scope handles *who*, the key handles *everything else*, so two different tenants (or
locales, or flag cohorts) can never share an entry.

Rule of thumb: after writing any `@Cacheable`, list every input that can change the result — user,
tenant, locale, role/scope, currency, flag cohort — and confirm each is in the scope **or** the key.

Reference: [NestJS GraphQL Resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 3.3 Run the No-Leak Checklist on Every Cached Read

**Impact: CRITICAL** — one list that catches the leaks before they ship

Before any cached read merges, confirm every line:

- [ ] Default is `public`; anything caller-varying **must** carry `@CacheScope('perUser')`.
- [ ] Key contains **every** result-varying input: user, tenant, locale, role/scope, currency, flag cohort.
- [ ] Anonymous `perUser` fields bypass.
- [ ] Never cache errors (a rejected loader leaves the cache untouched).
- [ ] Negative results (`null` / "not found") are a deliberate decision — cache them only with a
      short TTL, or a bad id hammers the source on every request.
- [ ] Tag index has a **cardinality ceiling**; purge atomically (`SMEMBERS`+`UNLINK` in one Lua script),
      never `KEYS`/unbounded `SCAN`.
- [ ] `referencesTTL` ≥ longest `ttl + swr`, and references are garbage-collected.
- [ ] CDN: never ship `must-revalidate`/`private` alongside `stale-while-revalidate` — they silently
      disable it.
- [ ] User identity comes from verified auth, never a raw client header.
- [ ] Cached values are plain serializable data (`.lean()`/DTOs) — never hydrated documents.

**Incorrect (a read that "looks fine" passes review):**

```typescript
@Cacheable({ ttl: 300, swr: 0 })
getAccount() { return this.repo.for(this.cls.get('userId')); } // public + no swr + no tags
```

Why it is wrong: it fails four checklist lines at once (public leak, no SWR, no revocation, unknown
negative behaviour) and nothing in the code says so.

**Correct (the checklist is satisfied visibly in the annotation):**

```typescript
@Cacheable({ ttl: 300, swr: 300, key: (a, ctx) => ['account', ctx.tenantId] })
@CacheScope('perUser')
@CacheTag((r) => `account:${r.id}`)
getAccount() { return this.repo.for(this.cls.get('userId')); }
```

Why it is right: scope, extra dimension, SWR, and a revocation tag are each visible, so the checklist
is a glance rather than an investigation.

Reference: [async-cache-dedupe invalidation](https://github.com/mcollina/async-cache-dedupe)

---

## 4. Invalidation

**Section Impact: HIGH**

### 4.1 Invalidate Only After a Successful Write

**Impact: HIGH** — a failed write must never drop a still-valid entry

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

---

### 4.2 Purge Atomically and Cap Tag Cardinality

**Impact: HIGH** — non-atomic purges leave orphans; unbounded tags stall Redis

The reverse index is `SADD <tag> <cacheKey>` per write; purging is `SMEMBERS` + `UNLINK`. Do the
resolve-and-delete in **one Lua script** — a concurrent `SADD` between the two round-trips survives the
sweep as a stale orphan. Guard cardinality, and use `UNLINK` (non-blocking), never `KEYS` or an
unbounded `SCAN`.

**Incorrect (two round-trips; unbounded tag; blocking delete):**

```typescript
const keys = await redis.smembers(`tag:${tag}`);   // a SADD here is lost below
for (const k of keys) await redis.del(k);          // DEL blocks; no cardinality guard
```

Why it is wrong: a write racing the purge leaves an orphan that is never invalidated, and a huge tag
set stalls Redis on a blocking `DEL`.

**Correct (one Lua sweep; cardinality guard; UNLINK):**

```lua
-- infra/cache/lua/purge-tag.lua
local members = redis.call('SMEMBERS', KEYS[1])
for i = 1, #members do redis.call('UNLINK', members[i]) end
redis.call('UNLINK', KEYS[1])
return #members
```

```typescript
const count = await redis.scard(`tag:${tag}`);
if (count > 5_000) throw new Error(`tag ${tag} over cardinality ceiling`); // shard/rotate instead
await redis.eval(purgeTagLua, 1, `tag:${tag}`);
```

Why it is right: the sweep is atomic, deletes are non-blocking, and a runaway tag is caught before it
stalls Redis.

Cluster notes:

- Prefix the tag set and its members with the **same `{hash tag}` slot** (`{tag:titles}:…`), or the
  Lua sweep fails `CROSSSLOT`.
- **Index TTL ≥ longest cache TTL**, else tag sets expire before their keys and purges silently miss.
- Beyond ~5k members, shard the tag or switch to a generation prefix (see
  `invalidation-generation-prefix`).

Reference: [Redis UNLINK](https://redis.io/commands/unlink) | [Redis cluster keyslot](https://redis.io/docs/reference/cluster-spec/)

---

### 4.3 Use a Generation Prefix for Huge or Coarse Domains

**Impact: MEDIUM** — O(1) invalidation instead of scanning thousands of keys

When a whole family of entries must be invalidated at once (a catalog-wide repricing, a schema change,
a feature rollout), a per-key tag sweep is the wrong tool. Put a **version counter in the key** and
bump it: every previously cached key becomes unreachable instantly, and the old keys age out by TTL.

**Incorrect (sweeping thousands of keys on every rollout):**

```typescript
// repricing shipped -> try to purge every catalog entry
await this.cache.invalidatePrefix('catalog:'); // SCAN over the whole keyspace; slow and per-node
```

Why it is wrong: a cluster-wide `SCAN` is expensive, per-node, and races with concurrent writes.

**Correct (bump a generation counter; keys change namespace):**

```typescript
// read site — the generation is part of the key
@Cacheable({
  ttl: 3600,
  swr: 300,
  key: async (a, ctx) => ['catalog', a.category, await ctx.gen('catalog')],
})
getCatalog(category: string) {}

// rollout — one INCR orphans every old key at once
await redis.incr('gen:catalog');
```

```text
before:  catalog:books:g4:...
after INCR: catalog:books:g5:...   (g4 keys expire untouched)
```

Why it is right: invalidation is O(1) and cluster-safe, and stale keys are reclaimed by their TTL
rather than by a scan.

Pair the generation with a **short hard TTL** so the old generation's keys self-clear, and cache the
counter value briefly (it is read on every key build) to avoid a Redis round-trip per call.

Reference: [Redis INCR](https://redis.io/commands/incr)

---

### 4.4 Tags Are Purge-Only, Never for Lookup

**Impact: HIGH** — using tags to fetch values breaks correctness

Tags (the engine calls them `references`) are a **reverse index**: a value carries many tags, and you
purge all values for a tag. They are only a set of strings linking cached entries to what can
invalidate them. You never fetch a value *by* tag — lookup is always by key.

**Incorrect (reading a value through a tag):**

```typescript
const entries = await client.invalidateAll; // treating tags as a queryable index
const title = entries.find((e) => e.tag === 'title:42'); // nonsense — tags hold keys, not values
```

Why it is wrong: tags do not store results, so this cannot return the cached value and loses the
key→value association.

**Correct (write: attach tags; read: by key; purge: by tag):**

```typescript
// read — attach tags that describe what would invalidate this value
@Cacheable({ ttl: 60, swr: 300 })
@CacheTag((r) => [`title:${r.id}`, 'titles:popular'])
getTitle(id: string) {}

// write — purge every entry carrying the tag, after success
@InvalidateTags((r, a) => [`title:${a.id}`, 'titles:popular'])
updateTitle(id: string, dto: Dto) {}
```

```text
lookup:   by key   -> cache:TitlesService.getTitle:{id:42}
purge:    by tag   -> SMEMBERS title:42 -> UNLINK each key
```

Why it is right: the value is found by its key, and the tag is used only to find which keys to
delete when the underlying data changes.

Reference: [mercurius-cache references](https://github.com/mercurius-js/cache)

---

## 5. Observability

**Section Impact: MEDIUM**

### 5.1 Know What the Engine Cannot Report

**Impact: MEDIUM** — stale-served and entry age are not events you get for free

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
2. **Report only what is real.** Emit `hit` / `miss` / `revalidate` (dedupe) / `bypass` / `error`, and
   report "revalidations" as the stampede metric instead of "stale_served".

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
onDedupe: () => emit({ outcome: 'revalidate', deduped: true }),
onError: () => emit({ outcome: 'error' }),
// stale-served / Age: only if you wrap the client with your own { value, writtenAt }
```

Why it is right: the dashboard reflects what the system actually reports, and any extra signal
(`Age`, stale ratio) is produced deliberately rather than assumed.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe)

---

### 5.2 Track the Metrics That Prove the Fix, and Test on Outcomes

**Impact: MEDIUM** — you cannot claim the stampede is gone without these numbers

Track: `hits`, `misses`, `revalidations` (`onDedupe`), `bypasses`, `errors`, `evictions`, `hit_ratio`.
Watch **revalidations** — consistently high means `ttl` is too short and every read is refreshing.

Provide test helpers backed by an in-memory store, and assert on the **outcome**, never on Redis
internals.

**Incorrect (asserting on Redis, no metrics):**

```typescript
expect(await redis.exists('cache:TitlesService.getTitle:42')).toBe(1); // brittle, implementation-bound
```

Why it is wrong: the test breaks on any key-shape or driver change and proves nothing about behaviour
under expiry.

**Correct (assert behaviour; instrument counters):**

```typescript
const fake = createCache({ ttl: 60, stale: 300, storage: { type: 'memory' }, onHit, onMiss, onDedupe });

// second call within ttl -> served from cache, loader not called again
expect(onMiss).toHaveBeenCalledTimes(1);
expect(onHit).toHaveBeenCalledTimes(1);

// past ttl, within ttl+swr -> value served AND exactly one revalidation
jest.advanceTimersByTime(61_000);
const [r1, r2, r3] = await Promise.all([getTitle('42'), getTitle('42'), getTitle('42')]);
expect(loader).toHaveBeenCalledTimes(2);          // initial + one revalidation
expect(onDedupe).toHaveBeenCalledTimes(1);        // single-flight worked
```

Why it is right: the test asserts the observable contract — freshness window, one deduped refresh,
hit/miss counting — independent of the storage implementation.

Also verify: an anonymous `perUser` read bypasses, a failed loader caches nothing, and invalidation
makes the next read fresh.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)

---

### 5.3 Surface a Per-Request Trace, Dev-Only on GraphQL

**Impact: MEDIUM** — one request shows exactly what was cached and why

Collect cache events in AsyncLocalStorage for the duration of a request, then surface them once at
the end:

- **GraphQL:** attach to `extensions.cache` via an Apollo `willSendResponse` plugin — **dev only**.
- **HTTP:** `X-Cache: HIT | STALE | MISS` + `Age`.
- Works across HTTP and BullMQ job context because the collection uses CLS, not the request object.

```typescript
// common/interceptors/cache-trace.interceptor.ts — APP_INTERCEPTOR
@Injectable()
export class CacheTraceInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(tap(() => {
      const events = this.cls.get<CacheEvent[]>('cacheEvents') ?? [];
      const summary = summarize(events); // worst outcome wins: MISS > STALE > HIT
      const res = ctx.switchToHttp().getResponse?.();
      if (res?.setHeader) { res.setHeader('X-Cache', summary.outcome); if (summary.ageMs) res.setHeader('Age', Math.round(summary.ageMs / 1000)); }
      if (!isProd) this.cls.set('cacheTrace', events);
    }));
  }
}
```

**Incorrect (logging inside each service call, no request view):**

```typescript
this.logger.debug(`getTitle ${outcome}`); // N lines per request, never correlated
```

Why it is wrong: you cannot see the request's overall cache behaviour, and production pays for debug
logging.

**Correct (aggregate per request; expose detail only in dev):**

```text
X-Cache: STALE
Age: 12
# dev GraphQL: extensions.cache = [ {key:'TitlesService.getTitle:{id:42}', outcome:'revalidate', deduped:true, ...} ]
```

Why it is right: one header summarizes the request, the dev extension carries the full evidence, and
nothing verbose ships to production.

Reference: [Apollo Server plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)

---

### 5.4 Emit Structured Cache Events, Not Log Strings

**Impact: MEDIUM** — every hit/stale/miss decision becomes queryable data

Emit one structured event per decision and push it into the request's context. Do not log formatted
strings — you cannot aggregate them, and the per-request trace depends on the shape.

```typescript
type CacheOutcome = 'hit' | 'stale' | 'miss' | 'revalidate' | 'bypass' | 'error';

interface CacheEvent {
  layer: 'service' | 'field' | 'operation';
  key: string;                    // readable parts, not a hash
  outcome: CacheOutcome;
  ageMs?: number; freshMs?: number; swrMs?: number;
  tags?: string[]; scope: 'public' | 'perUser';
  deduped?: boolean;              // proves single-flight worked
  durationMs: number; requestId?: string;
}
```

Wire the engine's hooks to the event stream:

```typescript
const client = createCache({
  ttl, stale: swr, storage,
  onHit:    () => emit({ outcome: 'hit' }),
  onMiss:   () => emit({ outcome: 'miss' }),
  onDedupe: () => emit({ outcome: 'revalidate', deduped: true }),
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

---

## 6. Drivers

**Section Impact: MEDIUM**

### 6.1 Option C — Apollo responseCachePlugin (Operation Level, TTL Only)

**Impact: MEDIUM** — minimal code, no SWR, and code-first directive gotchas

`@apollo/server-plugin-response-cache` (AS4+). Minimal code, operation-level, **no SWR**.

- Field hints via `@cacheControl(maxAge, scope, inheritMaxAge)` or `info.cacheControl.setCacheHint`.
- Response `maxAge` = **min** across included fields; `maxAge 0` anywhere → not cached.
- Response `scope` = `PRIVATE` if **any** field is `PRIVATE`. Root/object fields default to `maxAge 0`
  (opt-in only).
- Key = `source + operationName + variables + extraCacheKeyData (+ sessionId)`.
- `PUBLIC` splits into **2 buckets** (logged-out vs logged-in), *not* per-user.
- `PRIVATE` requires `sessionId`, else **not cached at all**.
- `options.cache` = a `KeyValueCache` → Redis via `@keyv/redis`.
- Never caches errors; sets `Age` on hits.
- Hooks: `sessionId`, `extraCacheKeyData`, `shouldReadFromCache`, `shouldWriteToCache`, `generateCacheKey`.
- **No stale-while-revalidate** — the pipeline cannot re-dispatch a background refresh.

### Code-first `@cacheControl` gotchas (NestJS)

- AS v5 no longer auto-inserts the directive — declare `@cacheControl` + `CacheControlScope` in
  `buildSchemaOptions.directives`.
- **Child object types and `@ResolveField`s must set `maxAge` or `inheritMaxAge: true`**, or their
  default `maxAge 0` cancels the whole cache.
- `@Directive('@cacheControl(...)')` emits the header but caches nothing until `responseCachePlugin` is
  registered.
- Helper lib: `nestjs-gql-cache-control`.
- `@nestjs/cache-manager`'s `CacheInterceptor` **does not work globally in GraphQL** — interceptors run
  per field resolver. Cache inside services instead.

**Incorrect (PRIVATE scope with no sessionId; child type left at default maxAge):**

```typescript
@Query(() => User)
@CacheControl({ maxAge: 60, scope: CacheControlScope.PRIVATE }) // no sessionId -> never cached
user() { /* ... */ }
// and User's @ResolveField has no inheritMaxAge -> maxAge 0 cancels the whole response
```

Why it is wrong: `PUBLIC` is not per-user, and `PRIVATE` without a `sessionId` silently caches nothing —
so the directive appears to do nothing.

**Correct (declare the directive, provide sessionId, inherit on children):**

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  buildSchemaOptions: { directives: [CacheControlDirective] }, // AS5: declare it yourself
  plugins: [responseCachePlugin({ sessionId: ({ context }) => context.req.user?.id ?? null })],
});
```

Why it is right: the directive is registered, private responses get the identity the plugin needs, and
child fields inherit the TTL instead of cancelling it.

Reference: [Apollo Server caching](https://github.com/apollographql/apollo-server)

---

### 6.2 Pick the Field-Level Option from Your Driver

**Impact: MEDIUM** — Apollo has no SWR; Mercurius does

NestJS supports two official GraphQL drivers, and the choice decides which field-level cache you can
use:

- `@nestjs/apollo` (Apollo Server — the common case, Express/Fastify).
- `@nestjs/mercurius` (Mercurius on Fastify).

Apollo has no SWR; Mercurius's `mercurius-cache` does. Either way, the **service-level** layer in this
skill works on both.

**Incorrect (assuming Apollo gives you SWR):**

```typescript
// on Apollo, expecting stale-while-revalidate from a response-cache plugin
plugins: [responseCachePlugin()]; // TTL-only; no SWR, no tags
```

Why it is wrong: Apollo's plugin cannot re-dispatch a background refresh, so every expiry is a blocking
miss — the exact spike you were removing.

**Correct (choose per driver; service layer either way):**

```typescript
// Mercurius: field-level with a real SWR window
MercuriusModule.forRoot({
  plugins: [{ plugin: mercuriusCache, options: { ttl: 60, stale: 300, /* policy per field */ } }],
});

// Apollo: get SWR from the service-level layer, not the server plugin
@Cacheable({ ttl: 60, swr: 300 }) getTitle(id: string) {}
```

Why it is right: the field-level capability matches the driver, and SWR comes from the layer that can
actually do it.

Reference: [NestJS GraphQL Quick start](https://docs.nestjs.com/graphql/quick-start)

---

### 6.3 Option A — async-cache-dedupe (Service Level, Transport-Agnostic)

**Impact: MEDIUM** — true SWR on Apollo without a field-level plugin

Best when you are on Apollo but want true SWR. Wrap any NestJS provider method.

- `createCache({ ttl, stale, storage, onHit, onMiss, onDedupe, onError })`
- `cache.define(name, { ttl, stale, references, serialize, transformer }, fn)`
- `cache.invalidateAll(references)` / `cache.clear(name, arg)`
- `stale` = seconds served after `ttl` expiry while refreshing (true SWR).
- **Single-flight/dedupe** built in: concurrent misses for one key → one call.
- Keys from `safe-stable-stringify`; `references` = tag-like invalidation.
- Storage `memory` | `redis` (ioredis), per-definition overrides possible.

**Incorrect (a definition with no invalidation and no storage override):**

```typescript
cache.define('getUser', (id) => db.user(id)); // no references -> cannot purge on write
```

Why it is wrong: nothing links the entry to the user it came from, so an update cannot revoke it.

**Correct (references enable tag invalidation; redis for shared):**

```typescript
cache.define('getUser', {
  ttl: 60,
  stale: 300,
  references: (args, key, result) => (result ? [`user:${result.id}`] : null),
}, (id: string) => db.user(id));

await cache.invalidateAll(['user:42']); // purge every entry referencing user 42
```

Why it is right: the entry carries a reference, so a write can revoke every read that saw the old
value.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe)

---

### 6.4 Option E — Transport / CDN SWR (Public Reads Only)

**Impact: MEDIUM** — removes the edge miss for anonymous traffic

For **public** reads only. Apollo sets `Cache-Control` from cache hints; MDN/RFC 5861
`stale-while-revalidate` lets the CDN serve stale at the edge.

- Enable **APQ** + `useGETForHashedQueries: true` so clients send short hashes via `GET` (CDNs cache
  `GET` only).
- Never combine with `must-revalidate`/`private` — they silently disable stale serving.
- Never use a shared/CDN cache for per-user responses.

**Incorrect (a directive combination that silently disables SWR):**

```typescript
res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
// 'private' -> no shared cache at all; SWR is a no-op at the CDN
```

Why it is wrong: `private` (or `must-revalidate`) prevents the shared cache from serving stale, so the
CDN provides no protection at expiry.

**Correct (public, hashable GETs, no conflicting directives):**

```typescript
res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

// Apollo
new ApolloDriverConfig({ plugins: [ApolloServerPluginCacheControl()] });
persistedQueries: { cache: redisCache },  // APQ
useGETForHashedQueries: true,
```

Why it is right: only public traffic hits the shared edge cache, GET + hash makes it cacheable, and no
conflicting directive disables stale serving.

Reference: [RFC 5861](https://www.rfc-editor.org/rfc/rfc5861) | [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)

---

### 6.5 Option D — Envelop useResponseCache (Not Native to NestJS)

**Impact: MEDIUM** — most complete semantics, but needs Yoga hosting

Most complete semantics, but it is the GraphQL Yoga plugin engine — needs Yoga hosting, no official
NestJS adapter.

- `ttl`, `ttlPerType` / `ttlPerSchemaCoordinate`, `ignoredTypes`, `shouldCacheResult`
- `session: ctx => String(ctx.user?.id)` — **required** (no global default, for security)
- `enabled: ctx => !isAdmin(ctx.user)`
- Auto-invalidate from mutation selection sets (`invalidateViaMutation`) + manual
  `cache.invalidate([{ typename, id }])`
- `Cache` interface → Redis / Cloudflare KV
- Debug: `extensions.responseCache.hit`, `invalidatedEntities`

**Incorrect (no `session` — disabled by design):**

```typescript
useResponseCache({ ttl: 60 }); // no session -> private results are not cached (safe, but useless here)
```

Why it is wrong: without a `session` callback there is no per-user key, so anything caller-varying is
refused rather than leaked — safe, but you get no personalization caching.

**Correct (explicit session; opt-out for privileged callers):**

```typescript
useResponseCache({
  ttl: 60,
  session: (ctx) => String(ctx.user?.id),   // required: per-user key
  enabled: (ctx) => !ctx.user?.isAdmin,      // bypass for admin views
  invalidateViaMutation: true,
});
```

Why it is right: the key is per-user by construction, privileged callers bypass, and mutations
auto-invalidate what they touched.

**Not a drop-in for NestJS.** Adopting it means hosting Yoga; if you are on `@nestjs/apollo` this is not
the practical path.

Reference: [Envelop useResponseCache](https://the-guild.dev/graphql/envelop/plugins/use-response-cache)

---

### 6.6 Federation Only — Apollo Router Response Caching

**Impact: LOW-MEDIUM** — entity-level caching at the router; SWR not yet honored

Router-level (v2.10+, preview): Redis, **entity-level** caching, `@cacheControl` for TTL and
`@cacheTag` for tag-based invalidation via an `/invalidation` endpoint.

**SWR is parsed/serialized but not yet honored** — do not rely on it here.

**Incorrect (assuming the router serves stale in the SWR window):**

```graphql
# expect the router to serve stale while revalidating
type Product @cacheControl(maxAge: 60) @cacheTag(format: "product:{id}") { id: ID! }
```

Why it is wrong: the router accepts the directive but does not revalidate in the background, so expiry
is still a miss at the router.

**Correct (use the router for TTL + tag invalidation; get SWR from the subgraph/service layer):**

```text
router:  @cacheControl(maxAge) + @cacheTag  -> TTL + tag invalidation
service: @Cacheable({ ttl, swr })           -> true stale-while-revalidate
```

Why it is right: each layer does what it actually supports.

This is a **federation-only** concern; in a single-service app it does not apply.

Reference: [Apollo Router caching](https://www.apollographql.com/docs/router/configuration/response-caching/)

---

### 6.7 Option B — mercurius-cache (Field Level, Real SWR)

**Impact: MEDIUM** — the only first-class per-field SWR cache, if you are on Mercurius

Only first-class option that caches **per resolver field** with a real SWR window.

- Global: `ttl`, `stale`, `all`, `storage: { type: 'memory'|'redis' }`
- Per-policy (`policy: { Type: { field: {...} } }`):
  - `ttl`, `stale` (per-field)
  - `references: (args, key, result) => string[]` — tag invalidation
  - `extendKey: (self, args, ctx) => string` — per-user keying (the no-leak control)
  - `skip: (self, args, ctx) => boolean` — bypass for auth/admin
  - `key` — custom serializer; `storage` — per-policy memory vs redis
- Invalidate: `app.graphql.cache.invalidate(['product:42'])`
- Built on `async-cache-dedupe` → dedupe + `gc` for reference integrity.
- NestJS wiring: `plugins: [{ plugin: mercuriusCache, options: { ... } }]`.

⚠️ **Default key is global.** Without `extendKey`/`skip`, private fields leak.

**Incorrect (global key on a viewer field):**

```typescript
policy: { Query: { viewer: true } } // shared key -> one user's viewer served to all
```

Why it is wrong: the default key does not include the caller, so the field is a leak.

**Correct (extendKey per user; skip for privileged callers):**

```typescript
policy: {
  Query: {
    viewer: {
      ttl: 60,
      stale: 300,
      extendKey: (self, args, ctx) => (ctx.userId ? `user:${ctx.userId}` : undefined),
      skip: (self, args, ctx) => !!ctx.user?.isAdmin,
      references: ({ args, result }) => (result ? [`viewer:${result.id}`] : null),
    },
  },
}
```

Why it is right: the key carries the caller (or the field is skipped), so private data never shares an
entry, and references make it revocable.

Reference: [mercurius-cache](https://github.com/mercurius-js/cache)

---

### 6.8 Pin Versions — This Area Drifts

**Impact: MEDIUM** — verify option names and semantics before you rely on them

Library option names, dependency requirements, and plugin semantics here change between releases. Verify
against your locked versions before quoting behaviour.

- Apollo Server 5; `@nestjs/apollo` v14 requires AS5 (`@apollo/server`), v13 is the previous line.
- `@nestjs/mercurius` matches `@nestjs/graphql` v13.
- `mercurius-cache` and `async-cache-dedupe` are maintained by NearForm/mcollina.
- Envelop: `session` required since v3; `ttlPerType` deprecated in favor of `ttlPerSchemaCoordinate`.
- `async-cache-dedupe`: explicit invalidation is **disabled by default**; `referencesTTL` must be set;
  Redis references need GC.
- `@nestjs/cache-manager` v6: `get()` returns `undefined` (v6) — treat `null`/`undefined` as a miss
  when migrating.

**Incorrect (relying on remembered option names):**

```typescript
// copied from an older release: option renamed / removed
ttlPerType: { User: 60 },  // deprecated -> use ttlPerSchemaCoordinate
```

Why it is wrong: silent no-op — the option is accepted but does nothing, so you believe you configured
something you did not.

**Correct (pin, then verify against the installed type definitions):**

```json
// package.json — pin the caching stack tightly
{ "async-cache-dedupe": "3.x", "ioredis": "5.x", "@nestjs/apollo": "14.x", "@apollo/server": "5.x" }
```

Why it is right: a pinned stack makes the guidance in this skill reproducible, and a mismatch is caught
at install rather than in production.

Rule: before adopting any option from this skill, open the installed package's type definitions (or its
README at your pinned version) and confirm the option still exists and means what you expect.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe)

---

## References

- https://docs.nestjs.com/techniques/caching
- https://docs.nestjs.com/fundamentals/dynamic-modules
- https://docs.nestjs.com/fundamentals/custom-providers
- https://docs.nestjs.com/recipes/async-local-storage
- https://github.com/mcollina/async-cache-dedupe
- https://github.com/mercurius-js/cache
- https://github.com/apollographql/apollo-server
- https://the-guild.dev/graphql/envelop/plugins/use-response-cache
- https://graphql.org/learn/performance/
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
- https://www.rfc-editor.org/rfc/rfc5861
- https://github.com/Papooch/nestjs-cls

---

*Generated by build-agents.ts on 2026-10-17*
