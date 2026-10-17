---
title: Implement the Decorators as Method Wrappers with Stable Names
impact: CRITICAL
impactDescription: the service-level decorator cannot be an interceptor
tags: decorators, metadata, interceptor, minification, key
---

## Implement the Decorators as Method Wrappers with Stable Names

**Impact: CRITICAL (the service-level decorator cannot be an interceptor)**

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
