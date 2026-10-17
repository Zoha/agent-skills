# NestJS GraphQL SWR Caching

**Version 2.2.0**
NestJS GraphQL SWR Caching
October 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

Implementation and policy guide for stale-while-revalidate (SWR) caching of GraphQL reads in NestJS (code-first) applications, designed for AI agents and LLMs. Covers the one-time module wiring (a forRootAsync cache module, its tokens, storage, invalidation, and context), the five knobs (key, tag, scope, ttl, swr), the callback contract for key/tag derivation, the @Cacheable/@CacheTag/@CacheScope/@InvalidateTags decorator surface, where to mount caching (service, field, operation, transport), leak safety (default-public scope, per-caller key dimensions, the no-leak checklist), tag-invalidation mechanics (referencesTTL, atomic purge, cardinality, generation prefixes), observability (structured events, per-request trace, metrics), a single dev/ops enable/disable switch that bypasses the service-level cache entirely, and the driver reality check across async-cache-dedupe, mercurius-cache, Apollo responseCachePlugin, Envelop, and CDN/APQ.

---

## Table of Contents

1. [One-Time Setup](#1-one-time-setup) — **CRITICAL**
   - 1.1 [Implement the Decorators as Method Wrappers with Stable Names](#11-implement-the-decorators-as-method-wrappers-with-stable-names)
   - 1.2 [Ship One Config Switch That Bypasses the Service-Level Cache](#12-ship-one-config-switch-that-bypasses-the-service-level-cache)
   - 1.3 [Use a Deduplicating Engine, and Count TTL in Seconds](#13-use-a-deduplicating-engine-and-count-ttl-in-seconds)
   - 1.4 [Fail Open, and Never Cache Errors](#14-fail-open-and-never-cache-errors)
   - 1.5 [Place the Capability by Who Imports It](#15-place-the-capability-by-who-imports-it)
   - 1.6 [Read the Caller from AsyncLocalStorage, Not Scope.REQUEST](#16-read-the-caller-from-asynclocalstorage-not-scoperequest)
   - 1.7 [Wire the Cache Module Once with forRootAsync](#17-wire-the-cache-module-once-with-forrootasync)
   - 1.8 [Enable Invalidation and Set referencesTTL and GC](#18-enable-invalidation-and-set-referencesttl-and-gc)
2. [Cache Policy](#2-cache-policy) — **CRITICAL**
   - 2.1 [Know the Five Knobs](#21-know-the-five-knobs)
   - 2.2 [Derive the Key Automatically, Never with JSON.stringify](#22-derive-the-key-automatically-never-with-jsonstringify)
   - 2.3 [Mount at the Service Level by Default](#23-mount-at-the-service-level-by-default)
   - 2.4 [The Decorators Are the One Writing Pattern](#24-the-decorators-are-the-one-writing-pattern)
   - 2.5 [The Service API Is an Escape Hatch, Not a Second Pattern](#25-the-service-api-is-an-escape-hatch-not-a-second-pattern)
3. [Leak Safety](#3-leak-safety) — **CRITICAL**
   - 3.1 [Scope Defaults to Public — Mark Caller-Varying Reads perUser](#31-scope-defaults-to-public--mark-caller-varying-reads-peruser)
   - 3.2 [Scope Covers the User Only — Every Other Dimension Goes in the Key](#32-scope-covers-the-user-only--every-other-dimension-goes-in-the-key)
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
   - 6.1 [Option C — Apollo responseCachePlugin (Operation Level, TTL Only)](#61-option-c--apollo-responsecacheplugin-operation-level-ttl-only)
   - 6.2 [Pick the Field-Level Option from Your Driver](#62-pick-the-field-level-option-from-your-driver)
   - 6.3 [Option A — async-cache-dedupe (Service Level, Transport-Agnostic)](#63-option-a--async-cache-dedupe-service-level-transport-agnostic)
   - 6.4 [Option E — Transport / CDN SWR (Public Reads Only)](#64-option-e--transport--cdn-swr-public-reads-only)
   - 6.5 [Option D — Envelop useResponseCache (Not Native to NestJS)](#65-option-d--envelop-useresponsecache-not-native-to-nestjs)
   - 6.6 [Federation Only — Apollo Router Response Caching](#66-federation-only--apollo-router-response-caching)
   - 6.7 [Option B — mercurius-cache (Field Level, Real SWR)](#67-option-b--mercurius-cache-field-level-real-swr)
   - 6.8 [Pin Versions — This Area Drifts](#68-pin-versions--this-area-drifts)

---

## 1. One-Time Setup

**Section Impact: CRITICAL**

### 1.1 Implement the Decorators as Method Wrappers with Stable Names

**Impact: CRITICAL** — the service-level decorator cannot be an interceptor

Nest interceptors only run for controller/resolver handlers — **not** for arbitrary service methods.
So `@Cacheable()` on a service method is implemented by wrapping `descriptor.value`. Because a
decorator cannot constructor-inject, it reaches the client with Nest's documented property injection,
applied from the decorator itself.

Five things break naive implementations:

1. **Key from `target.constructor.name`** — under minification/bundling the class name changes or
   collides, so entries are shared across different methods. Use an explicit, stable name.
2. **Stacking** — `@Cacheable` + `@CacheTag` + `@CacheScope` apply bottom-up; metadata must be
   **merged**, not overwritten, and the wrapper must be installed exactly once.
3. **Registration race** — register `client.define(name, …)` lazily and once; a second decorator
   running later must not re-wrap or re-define.
4. **Context** — the wrapper must preserve `this`/`async` and read the caller from CLS (see
   `setup-identity-context`), never assume a request. Read the **user identity** from CLS only for a
   `perUser` entry; read the other request dimensions (`tenantId`, `locale`) whenever a `key` override
   needs them. Wrap every CLS read so a missing context degrades to the source instead of throwing (see
   `setup-fail-open`).
5. **Callback contract** — `key` receives `(args, ctx)` with `args` the method's **argument list**, in
   call order; `@CacheTag` / `@InvalidateTags` receive `(result, args)` — **result first**. The list is
   positional, so reading `args.id` off a method whose first parameter is a bare `id` produces
   `undefined` key parts. The contract is canonical in `policy-key-derivation`.

**Incorrect (unstable key + overwritten metadata):**

```typescript
Reflect.defineMetadata(CACHE_SCOPE, scope, descriptor.value); // later decorator overwrites earlier
const name = `${target.constructor.name}.${propertyKey}`;     // minified -> collides
```

Why it is wrong: two decorators on one method clobber each other, and a production build can serve
one method's entries to another.

**Correct (explicit name, merged metadata, one contract, installed once):**

```typescript
// common/decorators/cache.decorators.ts
//
// One callback contract for the whole skill (canonical copy: policy-key-derivation):
//   key              = (args, ctx) => unknown[] | Promise<unknown[]>   args = the method's argument list, in call order
//   @CacheTag        = (result, args) => string[] | null               result = the method's return value
//   @InvalidateTags  = (result, args) => string[]                      both tag callbacks are SYNCHRONOUS
// `ctx` carries request-derived dimensions; it is empty outside a request, so a job must pass what
// it needs as an argument (see setup-identity-context). Annotate the argument tuple per method
// (`@Cacheable<[string]>`), or the default `unknown[]` will not type-check.
export const CACHE_META = Symbol('CACHE_META');
const WRAPPED = Symbol('CACHE_WRAPPED');

export interface CacheContext {
  userId?: string; tenantId?: string; locale?: string;
  pricingCohort?: string;              // add any other request-derived dimension here…
  gen(name: string): Promise<number>;  // …and set it in buildCacheContext below
}
export type CacheKeyFn<TArgs extends unknown[] = unknown[]> =
  (args: TArgs, ctx: CacheContext) => unknown[] | Promise<unknown[]>;
export type TagFn<TArgs extends unknown[] = unknown[], TResult = unknown> =
  (result: TResult, args: TArgs) => string[] | null;

interface CacheMeta {
  name?: string; ttl?: number; swr?: number;
  keyFn?: CacheKeyFn<any>; tagsFn?: TagFn<any, any>; scope?: 'public' | 'perUser';
}

export interface CacheableOptions<TArgs extends unknown[] = unknown[]> {
  name?: string; ttl?: number; swr?: number; key?: CacheKeyFn<TArgs>;
}
// NOTE: no `scope` and no `tags` — those are their own decorators (see policy-one-writing-pattern).

// The ONE place `ctx` is assembled. Everything here comes from CLS, so outside a request (a job or a
// subscription) each field is undefined and the caller must pass the value as an argument instead.
// `gen` is the generation counter (see invalidation-generation-prefix) — cache its value briefly, it
// is read on every key build.
function buildCacheContext(userId?: string): CacheContext {
  const read = <T>(key: string): T | undefined => {
    try {
      return ClsServiceManager.getClsService().get<T>(key) ?? undefined;
    } catch {
      return undefined;                  // no active context — a key build must never throw
    }
  };
  return {
    userId,
    tenantId: read<string>('tenantId'),
    locale: read<string>('locale'),
    pricingCohort: read<string>('pricingCohort'),
    gen: (name) => generationCounter(name),   // a briefly-cached redis INCR (invalidation-generation-prefix)
  };
}

function merge(target: object, key: string | symbol, patch: Partial<CacheMeta>) {
  const current = Reflect.getMetadata(CACHE_META, target, key) ?? {};
  Reflect.defineMetadata(CACHE_META, { ...current, ...patch }, target, key); // merge, never replace
}

// Installed once per method; every decorator below funnels through it, so stacking is order-safe.
function wrapOnce(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
  if ((descriptor.value as any)?.[WRAPPED]) return descriptor;
  const original = descriptor.value as (...a: unknown[]) => Promise<unknown>;

  const wrapped = async function (this: any, ...args: unknown[]) {
    const meta = Reflect.getMetadata(CACHE_META, target, propertyKey) as CacheMeta | undefined;
    if (!meta?.name) return original.apply(this, args);
    const scope = meta.scope ?? 'public';

    // Read the CLS identity only for a caller-scoped entry, and never let a missing context fail the request.
    let userId: string | undefined;
    if (scope === 'perUser') {
      try {
        userId = ClsServiceManager.getClsService().get<string>('userId') ?? undefined;
      } catch {
        userId = undefined;                                 // no active context (job / subscription)
      }
      if (!userId) return original.apply(this, args);        // anonymous -> bypass, never key ''
    }

    const client = this.cache as Cache;
    // Build `ctx` only when a key override needs it — a CLS read is pointless otherwise. `await` so an
    // async key (e.g. one that reads a generation counter) resolves before the argument bundle is
    // serialized; `await undefined` is harmless for a sync key.
    const k = meta.keyFn ? await meta.keyFn(args, buildCacheContext(userId)) : undefined;
    const arg = { a: args, k, u: userId };   // the stored key is the name plus this whole bundle

    if (!(client as any)[meta.name]) {
      client.define(meta.name, {
        ttl: meta.ttl,                 // SECONDS — omitting it disables caching (see setup-engine-choice)
        stale: meta.swr,               // SECONDS
        references: meta.tagsFn
          ? ({ a }: { a: unknown[] }, _key: string, result: unknown) => meta.tagsFn!(result, a)
          : undefined,
      }, ({ a }: { a: unknown[] }) => original.apply(this, a));
    }
    return (client as any)[meta.name](arg);
  };
  (wrapped as any)[WRAPPED] = true;
  descriptor.value = wrapped;
  return descriptor;
}

export function Cacheable<TArgs extends unknown[] = unknown[]>(
  opts: CacheableOptions<TArgs> = {},
): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    // Prefer an explicit `name`. The fallback is the class name, which minification can change or
    // collide — always pass `name` when you ship a bundled/minified build (see point 1 above).
    const name = opts.name ?? `${target.constructor.name}.${String(propertyKey)}`;
    Inject(CACHE_CLIENT)(target, 'cache');      // the one documented property-injection exception
    merge(target, propertyKey, { name, ttl: opts.ttl, swr: opts.swr, keyFn: opts.key });
    return wrapOnce(target, propertyKey, descriptor);
  };
}

// These record metadata only, so their position relative to @Cacheable does not matter.
export const CacheTag = <TArgs extends unknown[] = unknown[], TResult = unknown>(
  tagsFn: TagFn<TArgs, TResult>,
): MethodDecorator =>
  (target, propertyKey, descriptor: PropertyDescriptor) => {
    merge(target, propertyKey, { tagsFn });
    return wrapOnce(target, propertyKey, descriptor);
  };

export const CacheScope = (scope: 'public' | 'perUser'): MethodDecorator =>
  (target, propertyKey, descriptor: PropertyDescriptor) => {
    merge(target, propertyKey, { scope });
    return wrapOnce(target, propertyKey, descriptor);
  };

export const InvalidateTags = <TArgs extends unknown[] = unknown[], TResult = unknown>(
  tagsFn: TagFn<TArgs, TResult>,
): MethodDecorator =>
  (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...a: unknown[]) => Promise<unknown>;
    descriptor.value = async function (this: any, ...args: unknown[]) {
      const result = await original.apply(this, args);        // purge ONLY after the write succeeds
      const tags = tagsFn(result, args);
      if (tags?.length) await (this.cache as Cache).invalidateAll(tags);
      return result;
    };
    return descriptor;
  };
```

Why it is right: the name is explicit and stable, the four decorators merge into one metadata blob,
the wrapper is installed exactly once, the caller comes from CLS with an anonymous bypass and a
fail-open read, and `references` is actually wired to the tag callback instead of left undefined.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [NestJS Interceptors](https://docs.nestjs.com/interceptors)

---

### 1.2 Ship One Config Switch That Bypasses the Service-Level Cache

**Impact: MEDIUM-HIGH** — an off switch that does not break the file-layout boundary or lean on ttl: 0

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

---

### 1.3 Use a Deduplicating Engine, and Count TTL in Seconds

**Impact: CRITICAL** — SWR without reimplementing single-flight, and no 1000x TTL bug

Back the client with a deduplicating engine — `async-cache-dedupe` is the transport-agnostic default
(`mercurius-cache` is the same engine at the field level). Do not hand-roll the cache envelope unless
you actually need outcomes the engine cannot report (see `observability-limits-of-events`). The engine
gives you, for free: a real `stale` window, **single-flight dedupe**, `references`-based invalidation,
and stable-stringify keys.

Two unit facts that are the single most common implementation bug:

- **`async-cache-dedupe` takes `ttl`/`stale` in SECONDS.**
- `@nestjs/cache-manager`/Keyv and HTTP `Cache-Control` take **milliseconds**.

And one default that silently disables caching: **`ttl` defaults to `0`**, which the engine documents
as *"the function will be only the deduped"* — nothing is stored and every call reaches the source. So
`@Cacheable({ swr: 300 })` with no `ttl` caches **nothing**. Always set `ttl` explicitly; an omitted
one is the same class of silent no-op as a renamed library option (see `driver-version-pinning`).

A zero `ttl` is **dedupe-only, not an off switch**: concurrent identical calls still collapse and
storage and references are still wired. To disable the service-level cache entirely — dev, CI, or an
incident — use the module flag, which swaps in a passthrough client (see `setup-disable-switch`).

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
// raw engine: `references` returns string[] (or null), and its first argument is what the defined fn
// was called with — here the bare `id`, not the method's argument list (see driver-async-cache-dedupe)
client.define('TitlesService.getTitle',
  { references: (args, key, result) => (result ? [`title:${result.id}`] : null) },
  (id: string) => this.repo.findById(id));
```

Why it is right: SWR, dedupe, and references come from the engine; the units are the engine's
(seconds), and the policy (ttl/swr/tags) is all you write.

Reference: [async-cache-dedupe](https://github.com/mcollina/async-cache-dedupe) | [mercurius-cache](https://github.com/mercurius-js/cache)

---

### 1.4 Fail Open, and Never Cache Errors

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

### 1.5 Place the Capability by Who Imports It

**Impact: CRITICAL** — keeps infrastructure out of features and decorators feature-importable

Caching is a **capability** with two halves: an infrastructure half that only the composition root
imports, and a surface half that feature code imports. One rule decides where each file goes:

> A file goes to `infra/` if **only the composition root** imports it; to `common/` if **feature code**
> imports it.

Do not create a flat `src/cache/` folder, and do not invent a `common/<capability>/` folder for file
kinds that already have homes.

That split is the **general** rule, already owned by the `nestjs-graphql-structure` skill: see its
`struct-canonical-layout` (`infra/` holds one-time infrastructure, including the `<cache|queue|…>`
slot) and `infra-common` (`common/{decorators,filters,guards,interceptors,pipes,scalars,utils}`).
Follow it there rather than re-deriving it; only the cache-specific consequences are below.

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
│   │   └── cache-service.interface.ts # the CacheService port (token: infra/cache/cache.tokens.ts)
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
permits. The cache folder lands exactly where the canonical layout's `<cache|queue|…>` slot already
reserves it.

**Why `CacheModule` is `@Global()`.** `setup-module-wiring` registers the module globally, which the
sibling skill's `infra-shared-module` rule otherwise discourages. The exception is deliberate:
features must not import `infra/` (the boundary rule above), so a global module is how `CACHE_CLIENT`
reaches them without inverting the dependency direction. Put a comment at the `@Global()` site saying
so, so a reader applying both skills sees why the exception is there.

If the file-count scatter is unwanted, collapse the four decorators into the one
`common/decorators/cache.decorators.ts` file shown above (one cohesive API surface). A single
`infra/cache/` folder holding its own `decorators/`/`service/` is only acceptable with a deliberate,
documented lint exception for that path.

Reference: [NestJS Modules](https://docs.nestjs.com/modules#shared-modules)

---

### 1.6 Read the Caller from AsyncLocalStorage, Not Scope.REQUEST

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
@Cacheable({ ttl: 60, swr: 300, key: (args) => ['invoices', args[0]] })
rebuildInvoicesFor(userId: string) {}
```

Why it is right: the cache client stays a singleton, identity is set once from verified auth, and the
one context that has no request passes the id as an explicit key dimension.

Reference: [NestJS Async Local Storage](https://docs.nestjs.com/recipes/async-local-storage) | [nestjs-cls](https://github.com/Papooch/nestjs-cls)

---

### 1.7 Wire the Cache Module Once with forRootAsync

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

---

### 1.8 Enable Invalidation and Set referencesTTL and GC

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

// lazy: chunked. Carry the cursor the report returns, or you rescan the same first chunk forever.
let cursor: unknown;
setInterval(async () => {
  const report = await storage.gc('lazy', { lazy: { cursor } });
  if (report.error) return;                 // log it; never throw out of a timer
  cursor = report.cursor;
}, 60_000).unref();

setInterval(() => storage.gc('strict', { chunk: 250 }), 10 * 60_000).unref();
```

```typescript
// infra/cache/cache.module.ts — close the Redis connection on shutdown
// CACHE_REDIS is declared once, in infra/cache/cache.tokens.ts
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
| **ttl** | "How long is it *fresh*?" | In-window: served as-is, no work. **The engine defaults it to `0` = caching off (dedupe only)** — always set it. |
| **swr** | "After fresh, how long may I serve it *while refreshing*?" | Served instantly + background refresh. **Hard expiry = ttl + swr.** |

```
t=0 ─────────── ttl ────────────── ttl+swr ─────────────►
  ███ FRESH ███   ▒▒▒ STALE (served + bg refresh) ▒▒▒   ✗ GONE
  served instantly   served instantly, one deduped refresh   next call BLOCKS (miss)
```

`swr` removes the revalidation cliff — but only with **single-flight/dedupe**, so N concurrent stale
reads trigger **one** refresh, not N.

Scope ⇄ key, mechanically — the wrapper passes one bundle `{ a: args, k: keyParts, u: userId }` and
the engine keys the entry on its stable serialization, so `u` is what separates a caller-scoped entry
from a shared one:

```
public   →  getTitle:{"a":[42]}                     ← every caller shares this
perUser  →  getTitle:{"a":[42],"u":123}             ← only user 123 reads this
```

The stored key is the method name plus that bundle — not a prettified path. Read the key from an
event, never guess its shape (see `observability-structured-events`).

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

The engine keys an entry on the **name** you passed to `define` plus a **stable** serialization of the
argument it receives (`safe-stable-stringify`: key-order independent, circular-safe). The decorator
wrapper passes one bundle — `{ a: args, k: keyParts, u: userId }` — so that bundle *is* the key.
Override `key` only to add extra dimensions. Never use `JSON.stringify` yourself — its key order
follows insertion order, so the same logical input can produce different keys and silently miss (or,
worse, collide).

**Incorrect (unstable serialization; hand-built keys everywhere):**

```typescript
const key = `title:${JSON.stringify(dto)}`; // {a:1,b:2} and {b:2,a:1} hash differently
```

Why it is wrong: object key order changes the key, so the cache misses arbitrarily and entries
fragment.

**Correct (auto-derived, with an explicit override only for extra dimensions):**

```typescript
// default — the wrapper passes the method's arguments through unchanged, so the stored key is the
// name plus that bundle:  TitlesService.getTitle:{"a":[42]}
@Cacheable<[string]>({ ttl: 60, swr: 300 })
getTitle(id: string) {}

// override ONLY to add a dimension the args do not carry (locale, tenant, or a job with no request)
@Cacheable<[string]>({ ttl: 60, swr: 300, key: (args, ctx) => ['title', args[0], ctx.locale] })
getTitle(id: string) {}
```

**The callback contract** — canonical: every other rule in this skill refers here.

```typescript
type CacheKeyFn<TArgs extends unknown[] = unknown[]> =
  (args: TArgs, ctx: CacheContext) => unknown[] | Promise<unknown[]>;

type TagFn<TArgs extends unknown[] = unknown[], TResult = unknown> =
  (result: TResult, args: TArgs) => string[] | null;

interface CacheContext {
  userId?: string; tenantId?: string; locale?: string;   // from CLS, built per call (see setup-decorator-runtime)
  pricingCohort?: string;                                // …and any other request-derived dimension
  gen(name: string): Promise<number>;                    // generation counter (see invalidation-generation-prefix)
}
```

**What each parameter is, and where it comes from:**

| Callback | Receives | What builds it |
|---|---|---|
| `key(args, ctx)` | `args` = the method's **argument list, in call order**; `ctx` = request-derived dimensions | `args` is the wrapper's rest-parameter array; `ctx` comes from `buildCacheContext` (`setup-decorator-runtime`) |
| `@CacheTag(result, args)` | `result` = the method's **return value**; `args` = that same argument list | the resolved value the engine is about to store |
| `@InvalidateTags(result, args)` | same shape as `@CacheTag` — **result first** | the write's return value, after it resolves |

- `args[0]` is the first parameter — the list is positional, never a property. Reading `args.id` off a
  method whose first parameter is a bare `id` yields `undefined`.
- `ctx` carries the request-derived dimensions a positional argument cannot hold. It is empty outside
  a request, so a job or subscription must pass the value it needs as an argument instead (see
  `setup-identity-context`).
- Return an **array of primitives** (or a promise of one, for a key that needs `ctx.gen`). It becomes
  the `k` part of the stored bundle, so the final key stays stable and readable in events.

**Typing the callbacks.** The defaults are `unknown[]` / `unknown`, so a template literal like
`` `title:${a[0]}` `` does not type-check. Annotate the argument tuple once, per method — the first
type argument is always the tuple, so the decorators line up:

```typescript
@Cacheable<[string]>({ ttl: 60, swr: 300, key: (args) => ['title', args[0]] }) // args[0]: string
@CacheTag<[string]>((r, a) => [`title:${a[0]}`])                              // a[0]: string
getTitle(id: string) {}
```

**How the stored key is assembled.** The wrapper always keys on the whole bundle
`{ a: args, k: keyParts, u: userId }`, so a `key` override is **additive** — the raw arguments stay in
`a` even when you pass an override:

```text
TitlesService.getTitle:{"a":[42]}                           ← no override
TitlesService.getTitle:{"a":[42],"k":["title",42,"en-US"]}  ← with key: (args, ctx) => ['title', args[0], ctx.locale]
```

An override may repeat the arguments in `k` (readable in events) or return only the extra dimensions;
either way `a` is present. Confirm the real key from an event (`observability-structured-events`)
instead of guessing from a diagram.

**Serialization edge cases (they change the key):**

- `args` is serialized as-is, so `getTitle(42)` and `getTitle(42, undefined)` produce **different**
  keys (`[42]` vs `[42,null]`). Call the method the same way everywhere, or normalize in the override.
- An argument that is not plain data (a `Date`, an `ObjectId`, a document/DTO instance) is serialized by
  its own shape. Pass the id, not the entity.
- `key` may be **async** (for `ctx.gen`); `@CacheTag` / `@InvalidateTags` are **synchronous** — they
  return `string[] | null`, never a promise.

Why it is right: the default key is stable and named after the method, an override is a visible,
reviewable decision rather than the norm, and the service-level callback shape is the same everywhere.
At the **field/resolver** layer the driver supplies its own signatures — there `args` is the resolver's
named-argument object and `ctx` is the GraphQL context (see `driver-mercurius-cache`).

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

The **callback signatures are not** identical. At service level `args` is the method's positional
argument list (`args[0]`, and `(result, args)` on the tag callbacks — see `policy-key-derivation`). At
field level the driver hands you the resolver's **named-argument object** and the **GraphQL context** —
`extendKey: (self, args, ctx)` with `args.id`, not `args[0]`, and `ctx.userId`/`ctx.user` rather than
the skill's `CacheContext`. Do not copy a service-level callback into a field-level policy unchanged
(see `driver-mercurius-cache`).

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
  @Cacheable<[string]>({ ttl: 60, swr: 300 })
  @CacheTag((r, a) => [`title:${a[0]}`])   // same source as the write's purge (invalidation-tags-purge-only)
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
@Cacheable<[string]>({ ttl: 60, swr: 300, key: (args) => ['title', args[0]] })
@CacheTag((r, a) => [`title:${a[0]}`])   // (result, args) => string[]; same source as the purge below
getTitle(id: string) {}

// caller-scoped — explicit, because the result varies per caller
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getViewer(id: string) {}

// invalidate on write — runs only AFTER the method succeeds
@InvalidateTags((r, a) => [`title:${a[0]}`])
updateTitle(id: string, dto: Dto) {}
```

Why it is right: the leak-prone line (`@CacheScope('perUser')`) is a separate, greppable decorator,
and every method uses the same three shapes.

Rules:

- `@Cacheable` takes only `key`, `ttl`, `swr`. Never put `scope` or `tags` inside it.
- `@CacheTag(result, args)` returns `string[] | null` — never a bare string — and must be derived from
  the same value the matching `@InvalidateTags` uses, so the write purges exactly the string the read
  attached (see `invalidation-tags-purge-only`).
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
  return this.cache.wrap({ key: ['title', id], ttl: 60, swr: 300, load: () => this.repo.find(id) });
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
  // the same key parts a `key` override would return: an array of primitives, never a hand-built string
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
public   →  getViewerDashboard:{"a":[]}            ← served to every caller (WRONG when it varies)
perUser  →  getViewerDashboard:{"a":[],"u":123}    ← only user 123 reads this
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
// two tenants share getTitle:{"a":[42],"u":123} — the tenant is not in the key
@Cacheable({ ttl: 60, swr: 300 })
@CacheScope('perUser')
getTitle(id: string) { return this.repo.findById(id); } // tenant-scoped in the DB, not in the key
```

Why it is wrong: user 123 has the same key in every tenant, so tenant A's row is served in tenant B.

**Correct (user via scope; every other dimension as an explicit key part):**

```typescript
@Cacheable<[string]>({
  ttl: 60,
  swr: 300,
  key: (args, ctx) => ['title', args[0], ctx.tenantId, ctx.locale, ctx.pricingCohort],
})
@CacheScope('perUser')
getTitle(id: string) {}

// stored key: getTitle:{"a":[42],"k":["title",42,"acme","en-US","B"],"u":123} — every dimension
// except the user is in `k`; the user is in `u` (see policy-key-derivation for the bundle)
```

A new dimension is added in **two** places, because `ctx` is a plain object assembled per call: the
field on `CacheContext` **and** the matching CLS read in `buildCacheContext` (both in
`setup-decorator-runtime`). `pricingCohort` above is exactly such a field — it is not magic, it is a CLS
key you set once and read here.

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
- [ ] Tags are **`string[]`** (never a bare string) and derived from the same value as the matching
      `@InvalidateTags`, so the write purges exactly the string the read attached (see
      `invalidation-tags-purge-only`).
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
// no arguments, so the id can only come from `result` — the write that changes this account must
// purge the identical `account:<id>` string (see invalidation-tags-purge-only)
@Cacheable({ ttl: 300, swr: 300, key: (args, ctx) => ['account', ctx.tenantId] })
@CacheScope('perUser')
@CacheTag((r) => [`account:${r.id}`])
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
@InvalidateTags((r, a) => [`title:${a[0]}`])
updateTitle(id: string, dto: Dto) { return this.repo.update(id, dto); }

// a write that also changes a shared list must purge that tag too
@InvalidateTags((r, a) => [`title:${a[0]}`, 'titles:popular'])
publishTitle(id: string) { return this.repo.publish(id); }
```

Why it is right: the purge is declarative, fires only on success, and lives with the write that
changes the data.

Also: a durable write + a non-durable purge can desync (write commits, purge fails → stale until
`ttl + swr`). If that window is unacceptable, either make the purge retryable or treat the hard TTL as
the backstop by design.

Also: the string you purge must be the string the read attached — derive both from the same value
(`args` when the id is an argument, `result` otherwise) and match the type (see
`invalidation-tags-purge-only`).

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events)

---

### 4.2 Purge Atomically and Cap Tag Cardinality

**Impact: HIGH** — non-atomic purges leave orphans; unbounded tags stall Redis

The reverse index is `SADD <tag> <cacheKey>` per write; purging is `SMEMBERS` + `UNLINK`. On a single
Redis node, do the resolve-and-delete in **one Lua script** — a concurrent `SADD` between the two
round-trips survives the sweep as a stale orphan. (On Redis Cluster this script needs the slot
alignment described in the cluster notes below.) Guard cardinality, and use `UNLINK` (non-blocking),
never `KEYS` or an unbounded `SCAN`.

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

Why it is right: on a single node the sweep is atomic, deletes are non-blocking, and a runaway tag is
caught before it stalls Redis.

Cluster notes:

- **A script may only touch keys that hash to the same slot as the keys it declares.** The snippet
  above declares one key (the tag set) but `UNLINK`s members it reads at runtime, so on Redis Cluster
  it fails the cross-slot check unless every member lands in the tag set's slot.
- That alignment does **not** happen by itself: the members are cache keys **the engine names**
  (`TitlesService.getTitle:…`), not keys this rule generates. To make the single-slot sweep work you
  must pin the cache key to the slot yourself — override the key so it begins with the same
  `{tag:…}` hash tag the tag set uses (see `policy-key-derivation`).
- If you cannot pin the key, use a **two-step purge** instead (`SMEMBERS`, then `UNLINK` in bounded
  batches) and accept that a concurrent `SADD` can leave one orphan: re-run the sweep, or let the
  entry's `ttl + swr` retire it. Do not assume the atomic single-slot sweep on a cluster you have not
  verified.
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
@Cacheable<[string]>({
  ttl: 3600,
  swr: 300,
  key: async (args, ctx) => ['catalog', args[0], await ctx.gen('catalog')],
})
getCatalog(category: string) {}

// rollout — one INCR orphans every old key at once
await redis.incr('gen:catalog');
```

```text
before:      getCatalog:{"a":["books"],"k":["catalog","books",4]}
after INCR:  getCatalog:{"a":["books"],"k":["catalog","books",5]}   (generation-4 keys expire untouched)
```

Why it is right: invalidation is O(1) and cluster-safe, and stale keys are reclaimed by their TTL
rather than by a scan.

`ctx.gen(name)` is the read side of this counter; it is assembled with the rest of `ctx` in
`buildCacheContext` (`setup-decorator-runtime`). Pair the generation with a **short hard TTL** so the old
generation's keys self-clear, and cache the counter value briefly (it is read on every key build) to
avoid a Redis round-trip per call.

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
// (result, args) => string[] | null — NEVER a bare string
@Cacheable<[string]>({ ttl: 60, swr: 300 })
@CacheTag((r, a) => [`title:${a[0]}`, 'titles:popular'])
getTitle(id: string) {}

// write — purge every entry carrying the tag, after success
@InvalidateTags((r, a) => [`title:${a[0]}`, 'titles:popular'])
updateTitle(id: string, dto: Dto) {}
```

```text
lookup:   by key   -> getTitle:{"a":[42]}
purge:    by tag   -> SMEMBERS title:42 -> UNLINK each key
```

**Derive the read's tag and the write's purge tag from the same value.** Here both use `args[0]`, so the
strings are identical by construction. When the read has no argument carrying the id (a
`getViewerDashboard()`-style method), the read must fall back to `result.id` — then the write has to
produce that same string, including its type: `title:${42}` and `title:${'42'}` are different tags, and
a number/ObjectId `id` on one side against a string on the other is a purge that silently misses.

Why it is right: the value is found by its key, the tag is a `string[]` the engine can index, and the
purge tag is derived from the same value as the attach tag, so a write cannot leave a stale entry
behind.

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

---

### 5.2 Track the Metrics That Prove the Fix, and Test on Outcomes

**Impact: MEDIUM** — you cannot claim the stampede is gone without these numbers

Track: `hits`, `misses`, `dedupes` (`onDedupe`), `bypasses`, `errors`, `evictions`, `hit_ratio`.
Watch **dedupes** — a consistently high count means many callers were asking for the same key at the
same time, so single-flight is doing its job under load (or keys are too coarse). It is **not** a
TTL signal: the engine never tells you that a value was served while revalidating, so there is no
"stale ratio" to watch unless you wrap the client yourself (see `observability-limits-of-events`).

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

// past ttl, within ttl+swr -> value served AND one revalidation, from three concurrent callers
jest.advanceTimersByTime(61_000);
const [r1, r2, r3] = await Promise.all([getTitle('42'), getTitle('42'), getTitle('42')]);
expect(loader).toHaveBeenCalledTimes(2);          // initial + one refresh
expect(onDedupe).toHaveBeenCalledTimes(2);        // 3 concurrent callers -> 2 collapsed into the 1 load
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
the end. Surface **only what the engine actually reports** (`observability-limits-of-events`): the
callbacks give you hit / miss / dedupe / error, and nothing about staleness or entry age.

- **GraphQL:** attach to `extensions.cache` via an Apollo `willSendResponse` plugin — **dev only**.
- **HTTP:** a summary header using **only the outcomes the engine reports** — `X-Cache: HIT | MISS |
  DEDUPE | BYPASS` (and `ERROR`). Do **not** emit `STALE` or `Age` from the engine's callbacks: it
  has no stale callback and no entry age, so those values would read as zero forever (see
  `observability-limits-of-events`). Add them only once you wrap the client with your own
  `{ value, writtenAt }` record.
- **When `cache.enabled` is false** (`setup-disable-switch`), the engine never runs and emits **no**
  events. Report `X-Cache: BYPASS` from the config flag — an empty event list must not read as a clean
  "no cached reads" summary, which is indistinguishable from a cache that is switched off.
- The event **collection** works in both an HTTP request and a BullMQ job because it uses CLS, not
  the request object. The **header** is HTTP-only — a job has no response to write to, so a job reads
  the collected events instead.

```typescript
// common/interceptors/cache-trace.interceptor.ts — APP_INTERCEPTOR
@Injectable()
export class CacheTraceInterceptor implements NestInterceptor {
  constructor(
    private readonly cls: ClsService,
    private readonly config: ConfigService,   // cache.enabled — see setup-disable-switch
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(tap(() => {
      const events = this.cls.get<CacheEvent[]>('cacheEvents') ?? [];
      const summary = summarize(events); // worst outcome wins: MISS > DEDUPE > HIT
      const res = ctx.switchToHttp().getResponse?.();
      // a disabled cache emits no events -> report it from the flag, not from `summarize([])`
      const enabled = this.config.get<boolean>('cache.enabled') ?? true;
      if (res?.setHeader) res.setHeader('X-Cache', enabled ? summary.outcome : 'BYPASS');
      // Age exists ONLY if you wrapped the client (see observability-limits-of-events):
      // if (res?.setHeader && summary.ageMs) res.setHeader('Age', Math.round(summary.ageMs / 1000));
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
X-Cache: DEDUPE
# cache disabled (cache.enabled=false): X-Cache: BYPASS
# with your own { value, writtenAt } wrapper: X-Cache: STALE, Age: 12
# dev GraphQL: extensions.cache = [ {key:'TitlesService.getTitle:{"a":[42]}', outcome:'dedupe', deduped:true, ...} ]
```

Why it is right: one header summarizes the request, the dev extension carries the full evidence, and
nothing verbose ships to production.

Reference: [Apollo Server plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)

---

### 5.4 Emit Structured Cache Events, Not Log Strings

**Impact: MEDIUM** — every hit/miss/dedupe decision becomes queryable data

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
emit({ layer: 'service', key: 'TitlesService.getTitle:{"a":[42]}', outcome: 'hit',
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
  // raw engine: here `args` is the single value passed to the defined fn (the id), NOT the method's
  // argument list — the decorator wrapper in setup-decorator-runtime passes a `{ a, k, u }` bundle
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
  - `references: (info, key, result) => string[]` — tag invalidation; `result` is the **third**
    argument and `info` is the resolver bundle `{ source, args, context, info }`
  - `extendKey: (self, args, ctx) => string` — per-user keying (the no-leak control)
  - `skip: (self, args, ctx) => boolean` — bypass for auth/admin
  - `key` — custom serializer; at field level it must return a **string**, not an array
  - `storage` — per-policy memory vs redis
- Invalidate: `app.graphql.cache.invalidate(['product:42'])`
- Built on `async-cache-dedupe` → dedupe + `gc` for reference integrity.
- NestJS wiring: `plugins: [{ plugin: mercuriusCache, options: { ... } }]`.

⚠️ **Default key is global.** Without `extendKey`/`skip`, private fields leak.

⚠️ **Field level is not service level.** Here `args` is the resolver's **named-argument object**
(`args.id`, not `args[0]`), `ctx` is the **GraphQL context** (`ctx.userId`, `ctx.user`), and `self` is
the parent resolver's value. The service-level callback contract in `policy-key-derivation` does not
apply to these callbacks — only the five knobs do. mercurius-cache's own docs show `references` in two
shapes (`(args, key, result)` and `({ source, args, context, info }, key, result)`); confirm which your
pinned version calls (see `driver-version-pinning`), but in **both** `result` is a positional argument —
never a property of the first one.

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
      // info first, key second, result THIRD — destructuring `result` off the first argument yields
      // undefined and attaches no references at all
      references: ({ source, args, context, info }, key, result) =>
        (result ? [`viewer:${result.id}`] : null),
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
