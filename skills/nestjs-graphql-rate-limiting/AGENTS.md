# NestJS GraphQL Rate Limiting

**Version 1.0.0**
NestJS GraphQL Rate Limiting
October 2026

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

Layered rate-limiting and demand-control guide for NestJS GraphQL (code-first) applications, designed for AI agents and LLMs. Covers the one-time wiring (a global ThrottlerModule, the GraphQL-aware guard, a shared storage, one kill switch, fail-open behaviour, file placement), how to choose the limit unit (per operation rather than per HTTP POST, cost- or complexity-based), depth and cost control (depth-limit and query-complexity validation rules, self-referential depth, breadth and alias caps, introspection and persisted queries), field-level control (per-field cost weights, list multipliers, hot-field budgets), the declarative decorator surface (@RateLimit/@SkipRateLimit/@RateLimitCost and named windows), client identity (verified user over API key over tenant over IP, real client IP behind Cloudflare and other proxies, anonymous fallback), edge/Cloudflare deployment (defense in depth, CF-Connecting-IP trust, Cloudflare rate-limiting rules and the Workers Rate Limiting binding, Durable Objects versus KV for exact counters), error and observability shape (GraphQL 429 errors with extensions, RateLimit and Retry-After headers, metrics and a per-request trace), testing on outcomes with an in-memory store and frozen time, and the driver/version reality across Express, Fastify/Mercurius and Apollo v4/v5.

---

## Table of Contents

1. [One-Time Setup](#1-one-time-setup) — **CRITICAL**
   - 1.1 [Fail Open When the Counter Store Is Down](#11-fail-open-when-the-counter-store-is-down)
   - 1.2 [Place the Capability by Who Imports It](#12-place-the-capability-by-who-imports-it)
   - 1.3 [Make the Guard Read the GraphQL Context](#13-make-the-guard-read-the-graphql-context)
   - 1.4 [Ship One Switch That Disables Limiting](#14-ship-one-switch-that-disables-limiting)
   - 1.5 [Wire the Throttler Once, with Named Windows](#15-wire-the-throttler-once-with-named-windows)
   - 1.6 [Use a Shared Store, Never the Default Memory Store in a Fleet](#16-use-a-shared-store-never-the-default-memory-store-in-a-fleet)
2. [Operation Limits](#2-operation-limits) — **CRITICAL**
   - 2.1 [Price by Cost, Not by Call Count Alone](#21-price-by-cost-not-by-call-count-alone)
   - 2.2 [Count Once per Operation, Not Once per Field](#22-count-once-per-operation-not-once-per-field)
   - 2.3 [Layer the Limits, and Never Charge Twice](#23-layer-the-limits-and-never-charge-twice)
3. [Depth & Cost Limits](#3-depth--cost-limits) — **CRITICAL**
   - 3.1 [Cap Breadth: Aliases, Root Fields, Selections](#31-cap-breadth-aliases-root-fields-selections)
   - 3.2 [Gate Introspection and Require Persisted Queries](#32-gate-introspection-and-require-persisted-queries)
   - 3.3 [Cap Self-Referential Depth](#33-cap-self-referential-depth)
   - 3.4 [Enforce Depth as a Validation Rule, Before Execution](#34-enforce-depth-as-a-validation-rule-before-execution)
4. [Field Limits](#4-field-limits) — **HIGH**
   - 4.1 [Give Expensive Fields an Explicit Cost](#41-give-expensive-fields-an-explicit-cost)
   - 4.2 [Give a Hot Field Its Own Budget](#42-give-a-hot-field-its-own-budget)
   - 4.3 [Multiply List Cost by the Requested Page Size](#43-multiply-list-cost-by-the-requested-page-size)
5. [Declarative Control](#5-declarative-control) — **HIGH**
   - 5.1 [Make Every Skip Explicit and Greppable](#51-make-every-skip-explicit-and-greppable)
   - 5.2 [One Declarative Surface for Policy](#52-one-declarative-surface-for-policy)
   - 5.3 [Type the Options; Never Inline Magic Numbers](#53-type-the-options-never-inline-magic-numbers)
6. [Client Identity](#6-client-identity) — **HIGH**
   - 6.1 [Give Anonymous Callers a Coarse, Documented Bucket](#61-give-anonymous-callers-a-coarse-documented-bucket)
   - 6.2 [Resolve the Real Client IP Behind a Proxy](#62-resolve-the-real-client-ip-behind-a-proxy)
   - 6.3 [Track Verified User, Then API Key, Then Tenant, Then IP](#63-track-verified-user-then-api-key-then-tenant-then-ip)
7. [Edge & Cloudflare](#7-edge--cloudflare) — **MEDIUM-HIGH**
   - 7.1 [Enforce Cheap Limits at the Edge](#71-enforce-cheap-limits-at-the-edge)
   - 7.2 [Trust CF-Connecting-IP Only When the Origin Is Closed](#72-trust-cf-connecting-ip-only-when-the-origin-is-closed)
   - 7.3 [Layer the Edge and the Origin](#73-layer-the-edge-and-the-origin)
   - 7.4 [Use Durable Objects, Not KV, for Exact Counters](#74-use-durable-objects-not-kv-for-exact-counters)
8. [Errors & Observability](#8-errors--observability) — **MEDIUM**
   - 8.1 [Return a GraphQL Error with Extensions, Not a Bare 429](#81-return-a-graphql-error-with-extensions-not-a-bare-429)
   - 8.2 [Publish RateLimit and Retry-After Headers](#82-publish-ratelimit-and-retry-after-headers)
   - 8.3 [Count Rejections and Surface a Per-Request Trace](#83-count-rejections-and-surface-a-per-request-trace)
9. [Testing](#9-testing) — **MEDIUM**
   - 9.1 [Test the Rules on Documents, Table-Driven](#91-test-the-rules-on-documents-table-driven)
   - 9.2 [Prove the Limit End-to-End Against the Real Endpoint](#92-prove-the-limit-end-to-end-against-the-real-endpoint)
   - 9.3 [Test with an In-Memory Store and Frozen Time](#93-test-with-an-in-memory-store-and-frozen-time)
10. [Drivers & Versions](#10-drivers--versions) — **MEDIUM**
   - 10.1 [Match the Guard to the Driver's Context Shape](#101-match-the-guard-to-the-drivers-context-shape)
   - 10.2 [Register Validation Rules Where the Driver Reads Them](#102-register-validation-rules-where-the-driver-reads-them)
   - 10.3 [Pin the Stack; Validate Options Against Installed Types](#103-pin-the-stack-validate-options-against-installed-types)

---

## 1. One-Time Setup

**Section Impact: CRITICAL**

### 1.1 Fail Open When the Counter Store Is Down

**Impact: CRITICAL** — a Redis blip must not become a 500 for every request

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

---

### 1.2 Place the Capability by Who Imports It

**Impact: CRITICAL** — keeps infrastructure out of features and keeps the decorators importable

Rate limiting is a **capability** with two halves, and one rule decides where each file goes:

> A file goes to `infra/` if **only the composition root** imports it; to `common/` if **feature code**
> imports it.

That is the general rule already owned by `nestjs-graphql-structure` — see its `struct-canonical-layout`
(`infra/` holds one-time infrastructure) and `infra-common` (`common/{decorators,guards,...}`). Follow
it there; only the rate-limiting-specific consequences are below.

**Incorrect (one flat folder features reach into for infrastructure):**

```text
src/rate-limit/
  rate-limit.module.ts      # infrastructure, but sits beside feature-imported decorators
  throttler.storage.ts
  decorators.ts
  rate-limit.guard.ts
```

Why it is wrong: the folder mixes "composition-root-only" with "feature-imported", so a boundary lint
cannot tell them apart and a feature can import the storage client.

**Correct (split by importer; the module boundary lint enforces it):**

```text
src/
├── config/
│   └── rate-limit.config.ts          # typed namespace (registerAs)
├── common/
│   ├── guards/
│   │   └── gql-throttler.guard.ts    # the guard — registered globally, also @UseGuards-able
│   └── decorators/
│       └── rate-limit.decorators.ts  # @RateLimit / @SkipRateLimit / @RateLimitCost
├── infra/
│   ├── rate-limit/                   # ONLY the composition root imports this
│   │   ├── rate-limit.module.ts      # ThrottlerModule.forRootAsync wiring
│   │   ├── rate-limit.storage.ts     # the shared store (and the fail-open decorator)
│   │   └── rate-limit.tokens.ts
│   └── graphql/
│       └── graphql.module.ts         # depth / complexity validation rules live here
└── app.module.ts                     # imports RateLimitModule; registers APP_GUARD
```

Why it is right: infrastructure stays behind `infra/` (features may import `common/` but never
`infra/`), the guard and decorators that feature source files import live where the boundary permits,
and the config namespace sits in `config/` like every other one.

The depth and complexity rules are part of the **GraphQL server configuration**, so they belong in
`infra/graphql/` — not in a feature and not in `common/`. Do not create a feature-level rate-limiting
module: a module that only registers providers the composition root already registers is a duplicate.

Reference: [NestJS Modules](https://docs.nestjs.com/modules) | [NestJS GraphQL other features](https://docs.nestjs.com/graphql/other-features)

---

### 1.3 Make the Guard Read the GraphQL Context

**Impact: CRITICAL** — the stock guard silently mis-reads the request on resolvers

`ThrottlerGuard` reads the request through `ExecutionContext.switchToHttp()`. On a **resolver** the
execution context type is `graphql`, not `http`, so `switchToHttp().getRequest()` does not return your
Express/Fastify request. The stock guard therefore keys every resolver onto the wrong (or an empty)
request object. Subclass it and override `getRequestResponse` to pull `req`/`res` from
`GqlExecutionContext`, and make sure the GraphQL context actually contains them.

**Incorrect (the stock guard registered directly, context without req/res):**

```typescript
@Module({ providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }] })
export class AppModule {}

// infra/graphql/graphql.module.ts
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: () => ({}),          // no req/res -> whatever the guard finds is not the HTTP request
});
```

Why it is wrong: on resolvers the guard's request is not the HTTP request, so tracking is wrong (often
everyone collides on one bucket) or the guard throws when it dereferences a missing property.

**Correct (a GraphQL-aware guard, and a context that carries the transport objects):**

```typescript
// common/guards/gql-throttler.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext): { req: any; res: any } {
    const gql = GqlExecutionContext.create(context);
    const ctx = gql.getContext();               // the object built by GraphQLModule context
    return { req: ctx.req, res: ctx.res };
  }
}
```

```typescript
// infra/graphql/graphql.module.ts — the context the guard reads from
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
});

// app.module.ts — register the subclass, not the base class
@Module({ providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }] })
export class AppModule {}
```

Why it is right: the guard now receives the real HTTP request on resolvers, so the tracker and key are
computed from the correct object, and the context shape it depends on is guaranteed by the module.

**This guard runs once per resolver method, not once per HTTP request.** Nest binds guards to
resolvers, so an `APP_GUARD` covers every `@Query`, `@Mutation` and `@ResolveField` — which makes it the
natural **field** limiter, and the wrong tool for an operation count. The per-operation / per-endpoint
limit is a middleware or an Apollo plugin (`op-count-operations`). Register this subclass once, globally;
do not also `@UseGuards` the base class anywhere.

The same subclass is also where the tracker is defined (`identity-tracker-hierarchy`) and where the
kill switch short-circuits (`setup-kill-switch`). On Fastify/Mercurius the context keys differ — see
`driver-alignment`.

Reference: [nestjs/throttler — GraphQL guard](https://github.com/nestjs/throttler) | [NestJS GraphQL resolvers](https://docs.nestjs.com/graphql/resolvers)

---

### 1.4 Ship One Switch That Disables Limiting

**Impact: MEDIUM-HIGH** — an off switch for dev, CI and incidents that does not edit the code

You will need to turn the **counters** off without deleting annotations: local development (a warm
bucket hides the bug you are hunting), CI (exercise the unlimited path), and an incident (the limiter
itself is rejecting legitimate traffic and you need out now). One config flag — `rateLimit.enabled`
(env `RATE_LIMIT_ENABLED`, default `true`) — covers all three. Implement it in the guard (or via the
`skipIf` option), not by removing decorators.

Disable the **throttler layer only.** Depth and cost limits (`depth-*`) are cheap, deterministic and
protect the process itself; leave them on so an incident fix does not also reopen a denial-of-service
hole.

**Incorrect (the switch is code edits, or it disables every layer):**

```typescript
// "off" means commenting out decorators or the guard
// @RateLimit({ window: 'long' })
login() {}
```

```typescript
// and turning everything off also removes the depth cap
const rateLimitDisabled = process.env.RATE_LIMIT_ENABLED === 'false';
// -> depthLimit(...) and the complexity rule are skipped too
```

Why it is wrong: disabling by editing code is not a runtime decision and leaves a diff to remember to
revert; disabling the depth/cost layer removes the protection that does not depend on a shared store.

**Correct (one flag, resolved at boot, throttler layer only):**

```typescript
// config/rate-limit.config.ts
export default registerAs('rateLimit', () => ({
  enabled: process.env.RATE_LIMIT_ENABLED !== 'false', // default ON
  short: Number(process.env.RATE_LIMIT_SHORT ?? 20),
  medium: Number(process.env.RATE_LIMIT_MEDIUM ?? 100),
  long: Number(process.env.RATE_LIMIT_LONG ?? 600),
  redisUrl: process.env.RATE_LIMIT_REDIS_URL,
}));
```

```typescript
// infra/rate-limit/rate-limit.module.ts
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    throttlers: [
      { name: 'short',  ttl: seconds(1),  limit: config.get('rateLimit.short') },
      { name: 'medium', ttl: seconds(10), limit: config.get('rateLimit.medium') },
      { name: 'long',   ttl: minutes(1),  limit: config.get('rateLimit.long') },
    ],
    // one place the flag is read; the guard short-circuits for every request when false
    skipIf: () => !config.get<boolean>('rateLimit.enabled'),
  }),
});
```

Why it is right: turning limiting off is a deployment decision, the depth/cost layer survives, and the
enabled path is the same code you tested — nothing is deleted.

Rules of thumb:

- **Default on, but refuse off in production.** Assert `enabled === true` when `NODE_ENV ===
  'production'` (a validation-schema rule) so a stray env var cannot quietly disable a production
  limiter.
- **`NODE_ENV === 'test'`** may default it off so unit tests exercise the unlimited path — make that a
  visible line, not magic.
- **Emit a boot-time warning** when disabled, so a disabled limiter is never mistaken for a cold one.
- Per-route exemptions are a different tool: `@SkipRateLimit()` (`decorator-explicit-skips`).

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)

---

### 1.5 Wire the Throttler Once, with Named Windows

**Impact: CRITICAL** — one global guard and one config, not per-resolver wiring that drifts

Register `ThrottlerModule` **once** — in the composition root or in `infra/` — declare a small set of
**named windows** (`short`, `medium`, `long`), and apply the guard **globally** with `APP_GUARD`. A
feature then expresses policy by *name* (`@RateLimit({ window: 'medium' })`) instead of inventing its
own numbers, so limits are one reviewable table rather than scattered magic constants.

`ttl` is **milliseconds** in throttler v5+; `seconds(...)` and `minutes(...)` keep the config readable
and prevent the classic 1000× error.

**Incorrect (each resolver picks its own guard and its own numbers):**

```typescript
// modules/auth/resolvers/auth.mutation.resolver.ts
@Resolver(() => Auth)
@UseGuards(ThrottlerGuard)                 // per-resolver wiring — easy to forget on a new resolver
export class AuthMutationResolver {
  @Mutation(() => TokenResponse)
  @Throttle({ default: { limit: 5, ttl: 60000 } })   // a bare number that means something only here
  login() {}
}
// and again, differently, in every other resolver
```

Why it is wrong: the guard is opt-in, so a resolver added later silently has no limit; the numbers
exist only at call sites; and nothing enforces the same window in two places.

**Correct (one module, named windows, one global guard):**

```typescript
// infra/rate-limit/rate-limit.module.ts
import { ThrottlerModule } from '@nestjs/throttler';
import { seconds, minutes } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          { name: 'short',  ttl: seconds(1),  limit: config.get('rateLimit.short') },
          { name: 'medium', ttl: seconds(10), limit: config.get('rateLimit.medium') },
          { name: 'long',   ttl: minutes(1),  limit: config.get('rateLimit.long') },
        ],
        storage: buildThrottlerStorage(config),   // shared store — see `setup-storage`
      }),
    }),
  ],
})
export class RateLimitModule {}

// app.module.ts — the one global registration
@Module({
  providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }],  // see `setup-graphql-guard`
  imports: [RateLimitModule],
})
export class AppModule {}

// a resolver only names a window; it never re-invents limits
@Mutation(() => TokenResponse)
@RateLimit({ window: 'long' })
login(@Args('input') input: LoginInput) {}
```

Why it is right: the guard is global (nothing is unprotected by accident), every window is defined
once and named, and a resolver's policy is a one-line, greppable reference to that table.

The config arrives through a typed namespace, never `process.env` at the call site — see
`devops-use-config-module` in the `nestjs-best-practices` skill and `infra-config` in
`nestjs-graphql-structure`.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [nestjs/throttler](https://github.com/nestjs/throttler)

---

### 1.6 Use a Shared Store, Never the Default Memory Store in a Fleet

**Impact: CRITICAL** — with N replicas the real limit becomes N x the configured one

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

---

## 2. Operation Limits

**Section Impact: CRITICAL**

### 2.1 Price by Cost, Not by Call Count Alone

**Impact: CRITICAL** — a count limit prices a cheap query and a monster identically

A request count treats `{ me { id } }` and `{ search(first: 500) { edges { node { ...50 fields } } } }`
as one unit each. They are not. The real unit is **cost**. Keep two mechanisms:

- a **ceiling** — reject any single document whose cost exceeds `maxCost` (the validation rule, see
  `depth-validation-rule`);
- a **budget** — charge each accepted operation its cost against a per-tracker window, so many cheap
  queries or a few expensive ones both run out of the same allowance.

Cost is computed *before* resolvers run (validation), so the guard/interceptor can read it and charge
the budget.

**Incorrect (a pure count, so one monster query is "1 request"):**

```typescript
// 60 operations/minute — but one operation can cost 500 units
ThrottlerModule.forRoot([{ name: 'long', ttl: 60_000, limit: 60 }]);
```

Why it is wrong: an attacker fits one maximum-complexity query per second, stays under the count, and
spends a thousand times a normal client's resources.

**Correct (a cost ceiling plus a cost budget):**

```typescript
// infra/graphql/graphql.module.ts — the ceiling, computed during validation
import { createComplexityRule, simpleEstimator, fieldExtensionsEstimator } from 'graphql-query-complexity';

validationRules: [
  createComplexityRule({
    maximumComplexity: 1000,
    estimators: [fieldExtensionsEstimator(), simpleEstimator({ defaultComplexity: 1 })],
    // onComplete receives a MAP of operation name -> cost, not a single number.
    onComplete: (complexities: Record<string, number>) => {
      currentCost.set(Math.max(...Object.values(complexities)));
    },
  }),
];
```

```typescript
// infra/rate-limit/budget.ts — charge cost against the window, not a flat 1
async function chargeBudget(tracker: string, cost: number): Promise<ChargeResult> {
  const key = `budget:${tracker}:long`;
  // ThrottlerStorage.increment counts by ONE (key, ttl, limit, blockDuration, name),
  // so a cost budget needs your own atomic increment-by-N over the same store:
  const total = await redis.incrby(key, cost);          // atomic; 500-cost query spends 500
  if (total === cost) await redis.pexpire(key, COST_TTL_MS);
  return { isBlocked: total > COST_BUDGET };
}
```

Why it is right: cheap reads stay cheap, an expensive query is priced like the work it does, and a
burst of either can no longer hide behind a request counter.

Practical notes:

- **The ceiling and the budget use the same estimator chain** (`field-cost-weights`,
  `field-list-multipliers`), so the number you reject on and the number you charge are the same
  number — two different cost models are a bug waiting to happen.
- `ThrottlerStorage.increment(key, ttl, limit, blockDuration, name)` **counts by one** — it takes no
  "hits" argument. A cost budget needs either your own `INCRBY`-style primitive over the same store
  (as above), or a credit bucket that decrements by `cost`.
- **Default cost per field is 1**, and a scalar is genuinely cheap; the estimator chain is where you
  say a list, a search, or an aggregate costs more.

Reference: [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) | [GraphQL performance](https://graphql.org/learn/performance/)

---

### 2.2 Count Once per Operation, Not Once per Field

**Impact: CRITICAL** — the per-field trap makes a list query spend its budget N times

Two facts about NestJS + GraphQL decide where the limit lives:

1. **Nest binds guards to resolver methods.** A `@Query`, `@Mutation` or `@ResolveField` method is a
   resolver, and an `APP_GUARD` runs for **each** of them, so `ThrottlerGuard` on a GraphQL app counts
   *resolver invocations*, not HTTP requests. A list query invokes its field resolver once **per
   parent** (`users { posts }` over 100 users runs the `posts` resolver 100 times), so one read can
   spend the budget N times over. Measure the multiplier for your schema with a counted test
   (`test-storage-and-time`) instead of assuming it.
2. **One HTTP POST can carry several operations** (Apollo batching) or one field under many **aliases**.

So "endpoint call rate limit" and "field rate limit" are different mechanisms:

| You want | Count it with | Runs |
|---|---|---|
| Endpoint / operation limit | HTTP middleware before the GraphQL endpoint, or an Apollo `didResolveOperation` plugin | once per request/operation |
| Field limit | the Nest guard (throttler) | once per resolver field |

**Incorrect (assume the global guard limits requests, and allow batching):**

```typescript
@Module({ providers: [{ provide: APP_GUARD, useClass: GqlThrottlerGuard }] })
export class AppModule {}

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  allowBatchedHttpRequests: true,       // one POST -> many operations, each uncounted
});
```

Why it is wrong: the count is per field, so the numbers mean nothing; and batching lets one POST hide
many operations from any per-request counter.

**Correct (a once-per-request counter, plus the field layer kept separate):**

```typescript
// infra/rate-limit/operation-rate-limit.middleware.ts — mounted before the GraphQL handler
@Injectable()
export class OperationRateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly store: ThrottlerStorage,        // the same shared store (`setup-storage`)
    @Inject(RATELIMIT_OPTIONS) private readonly opts: RateLimitOptions,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tracker = resolveTracker(req);             // `identity-tracker-hierarchy`
    const key = `op:${tracker}:${this.opts.window}`;
    const { totalHits, isBlocked, timeToBlockExpire } =
      await this.store.increment(key, this.opts.ttl, this.opts.limit, this.opts.blockDuration, 'op');
    if (isBlocked) return this.reject(res, timeToBlockExpire);   // `obs-error-shape`
    next();
  }
}
```

```typescript
// infra/graphql/graphql.module.ts — one operation per request unless you truly need batching
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  allowBatchedHttpRequests: false,
});
```

Why it is right: the middleware runs exactly once per HTTP request, the field-level guard keeps its own
separate meaning, and batching cannot smuggle work past the counter.

If a client genuinely needs batching, charge **per operation in the batch**: in an Apollo
`didResolveOperation` plugin or a batched-body middleware, increment once per element of the request
array rather than once per HTTP request. Aliases inside one operation are handled by the cost rule
(`op-cost-based-limits`, `depth-breadth-aliases`), not by a second counter.

Reference: [NestJS Guards](https://docs.nestjs.com/guards) | [Apollo Server request pipeline](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)

---

### 2.3 Layer the Limits, and Never Charge Twice

**Impact: CRITICAL** — overlapping counters compound and block legitimate traffic

Demand control is a stack, and each layer must own a **distinct unit** so the limits compose instead
of compounding:

| Layer | Owns | Unit |
|---|---|---|
| Edge (Cloudflare) | crude flood protection | requests per IP / path / country |
| Origin — operation | how much work a caller may spend per window | operations or cost units per tracker |
| Origin — field | a single expensive field | field resolutions per tracker |
| Document guard | whether the document may run at all | depth / complexity (a ceiling, not a rate) |

**Incorrect (two layers measuring the same thing, so the effective limit halves):**

```typescript
// Cloudflare rule: 100 requests/minute per IP
// origin long window: 100 operations/minute per IP
// -> a legitimate client is blocked around 50/min, and nobody knows why
```

Also wrong, and worse:

```typescript
// the guard counts the request...
@UseGuards(GqlThrottlerGuard)
@Query(() => [Item])
async items(): Promise<Item[]> {
  await this.throttlerStorage.increment(/* the same key again */);  // ...and so does the handler
  return this.itemsService.findAll();
}
```

Why it is wrong: identical units at two layers compound to half the intended limit, and a handler that
also increments its own counter double-charges every call.

**Correct (distinct units, one owner each, and the ceiling kept on):**

```typescript
// 1. Edge: crude, per-IP flood only. Deliberately looser than the origin.
//    Cloudflare rule: 600 requests/minute per IP.

// 2. Origin — operation (once per request): the real budget.
OperationRateLimitMiddleware;   // 120 operations/minute per tracker — see `op-count-operations`

// 3. Origin — field (per resolver): only on the genuinely hot field.
@Query(() => [Item])
@RateLimit({ window: 'short' })   // `decorator-one-writing-pattern`
items() {}

// 4. Document ceiling (depth/cost): always on, independent of counters.
validationRules: [depthLimit(10), complexityLimit(1000)];
```

Why it is right: each layer has one job and one unit, so the numbers are meaningful and additive, and
the depth/cost ceiling stays on even when the counters are disabled (see `setup-kill-switch`).

Rules of thumb:

- **Keep the edge looser than the origin.** The edge is the blunt instrument; the origin is the
  precise one. If they are equal, the client sees the sum of two limits, not the tighter one.
- **One counter per concern.** The operation counter is incremented in exactly one place; the field
  guard is the only thing that increments the field counter. A service never touches the store.
- **Document the budget as a table.** A reviewer should be able to see all four layers and their units
  at once; three scattered magic numbers is how double-charging happens.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [GraphQL performance](https://graphql.org/learn/performance/)

---

## 3. Depth & Cost Limits

**Section Impact: CRITICAL**

### 3.1 Cap Breadth: Aliases, Root Fields, Selections

**Impact: HIGH** — depth limits do not stop a wide document, and aliases repeat a field for free

Depth counts how *deep* a document goes; it says nothing about how *wide* it is. An alias lets a client
run the same expensive field many times in one operation without nesting:

```graphql
{ a: search(term: "x") { ... } b: search(term: "x") { ... } /* ... 40 more ... */ }
```

Every alias is a separate resolver invocation at the same depth, so a depth cap of 10 does not see it.
Bound the breadth too.

**Incorrect (only a depth rule):**

```typescript
validationRules: [depthLimit(10)];   // { a: expensive b: expensive ... } passes
```

Why it is wrong: the document is shallow, so the depth cap never fires, yet one request performs fifty
expensive operations.

**Correct (bound aliases, root fields and total selections):**

```typescript
// infra/graphql/graphql.module.ts — a small breadth rule alongside depth and cost
validationRules: [
  depthLimit(10),
  breadthLimit({ maxAliases: 15, maxRootFields: 10, maxSelections: 200 }),
  createComplexityRule({ /* ... */ }),   // `op-cost-based-limits` is the general-purpose answer
];
```

```typescript
// infra/graphql/breadth-limit.rule.ts — count the shapes that amplify
export function breadthLimit(
  opts: { maxAliases: number; maxRootFields: number; maxSelections: number },
): ValidationRule {
  return (context) => ({
    OperationDefinition(node) {
      const { aliases, selections } = countNode(node);   // one walk, two counters
      if (aliases > opts.maxAliases) {
        context.reportError(new GraphQLError(`Too many aliases (${aliases} > ${opts.maxAliases})`));
      }
      if (selections > opts.maxSelections) {
        context.reportError(new GraphQLError(`Too many selections (${selections} > ${opts.maxSelections})`));
      }
      return false;   // walked manually above
    },
  });
}
```

Why it is right: aliasing stops being a free multiplier, a shallow-but-huge document is rejected in
validation, and the cost rule is the fallback that prices shapes this rule does not name.

Notes:

- **The cost model already prices aliases** if your estimator walks them (`op-cost-based-limits`) — a
  breadth rule is the cheap, explicit belt to that braces. Use one of them deliberately, not both with
  no idea which fires.
- **Root-field caps** (`maxRootFields`) also blunt the "fan-out" query that resolves many unrelated
  top-level fields in one call.
- **Apollo Router** exposes `max_aliases`, `max_root_fields`, and `max_recursive_selections` as
  configuration if you terminate at the router; in-app, implement the rule above or use a maintained
  security plugin such as GraphQL Armor (`depth-validation-rule` names where it is registered).
- **`graphql-no-alias`** is the narrow, single-purpose version of this rule; prefer it over a bespoke
  counter if you only need the alias cap.

Reference: [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) | [GraphQL Armor](https://escape.tech/graphql-armor/)

---

### 3.2 Gate Introspection and Require Persisted Queries

**Impact: MEDIUM** — a public schema plus arbitrary documents is the attack surface

Depth, cost and breadth rules bound *how bad* an arbitrary document can be. The stronger posture is to
stop accepting arbitrary documents at all: disable introspection in production, and let clients send a
**persisted query hash** (`GET`) so the server only ever executes documents it has seen and vetted.
Bounded documents + known documents is defence in depth; either alone is not.

**Incorrect (introspection always on, arbitrary documents always allowed):**

```typescript
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  introspection: true,          // exposes the full schema to anyone, in production too
  // persistedQueries not configured -> every client may send any document it likes
});
```

Why it is wrong: an attacker reads the whole schema (including the expensive fields) and then crafts
documents exactly at the edges of your limits.

**Correct (introspection gated by environment, persisted queries required in production):**

```typescript
// infra/graphql/graphql.module.ts
GraphQLModule.forRootAsync<ApolloDriverConfig>({
  driver: ApolloDriver,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    introspection: config.get('app.nodeEnv') !== 'production',   // dev tooling keeps it; prod does not
    persistedQueries: {
      cache: new RedisPersistedQueryCache(config.get('rateLimit.redisUrl')),  // by hash
    },
    // `allowBatchedHttpRequests: false` — see `op-count-operations`
  }),
})
```

```typescript
// infra/graphql/graphql.module.ts — for a hard allow-list, add an APQ-aware plugin that
// rejects any document not in the persisted set (a cache miss must NOT fall back to executing
// an arbitrary query in production).
```

Why it is right: production executes only vetted documents, arbitrary-document abuse is off the table,
and the depth/cost rules become a backstop for the still-allowed `POST` path rather than the only
defence.

Notes and traps:

- **APQ is not an allow-list by itself.** With automatic persisted queries, a cache miss means the
  server accepts and stores the full query — so it does *not* restrict what can run. To actually
  restrict, run a **trusted document / allow-list** mode (only hashes you published are honoured).
  Choose APQ for bandwidth and trusted documents for security; they are different products.
- **Disabling introspection breaks GraphiQL and some client tooling** — gate it by environment, and
  keep it on in non-production.
- **Introspection bypasses depth by default** (`graphql-depth-limit` ignores introspection fields) —
  if you allow introspection in production, cap it too rather than assuming the depth rule covers it.
- **`GET` + CDN** is where persisted queries earn their keep: a hash is cacheable at the edge, which is
  also why the edge layer (`edge-defense-in-depth`) should be configured to cache it.

Reference: [Apollo Server provisioning](https://www.apollographql.com/docs/apollo-server/performance/apq/) | [NestJS GraphQL other features](https://docs.nestjs.com/graphql/other-features)

---

### 3.3 Cap Self-Referential Depth

**Impact: CRITICAL** — a cycle in the graph is the real amplification vector

The dangerous depth is not a deep chain of *distinct* types — it is the same field re-entering itself:
`friends { friends { friends { ... } } }`, `comment { replies { replies { ... } } }`,
`category { parent { parent { ... } } }`. A flat depth cap catches it, but it also over-charges normal
nesting, and a per-type cap is more honest: allow "friends of friends" (depth 2) and reject the third.

`graphile/depth-limit` exists precisely for this: it caps how many times a field coordinate may recur,
with per-coordinate overrides.

**Incorrect (one global depth number, blind to cycles):**

```typescript
validationRules: [depthLimit(15)];
// { friends { friends { ... 14 more ... } } } is "depth 15" and allowed; a legitimate
// { order { lines { product { category { parent } } } } } is only depth 5 but counts the same way
```

Why it is wrong: a cyclic field is allowed as deep as any other field, so the one shape that amplifies
is not treated specially, and the limit that would stop it is set high to accommodate honest nesting.

**Correct (a low self-referential cap with per-field overrides):**

```typescript
// infra/graphql/graphql.module.ts
import { createDepthLimitRule } from '@graphile/depth-limit';

validationRules: [
  createDepthLimitRule({
    maxDepth: 10,
    maxSelfReferentialDepth: 2,                      // friends of friends, never friends^3
    maxDepthByFieldCoordinates: { 'User.friends': 2, 'Comment.replies': 3 },
  }),
];
```

```graphql
# allowed: two hops — "friends of friends"
{ me { friends { friends { id } } } }

# rejected at validation: the third hop re-enters the same field
{ me { friends { friends { friends { id } } } } }
```

Why it is right: the rule targets the amplifying shape directly, honest nesting keeps its own budget,
and the exception for a field that legitimately recurs (a comment thread) is declared in one place.

Notes:

- **`graphql-depth-limit` counts depth including fragments but has no self-referential notion.** If you
  only need "no document deeper than N", it is enough (`depth-validation-rule`); if your schema has
  cycles, use the coordinate-aware rule. Either way, verify the package and its API against your
  pinned versions.
- **Fragments and inline fragments count.** A cycle hidden behind a fragment spread is still a cycle;
  make sure the rule flattens fragments.
- **Recursive relations are usually a DataLoader problem too** — batching (`relations-dataloader` in
  the `nestjs-graphql-structure` skill) removes N+1 but not the depth; the depth cap is still required.

Reference: [graphile/depth-limit](https://github.com/graphile/depth-limit) | [graphql-depth-limit](https://www.npmjs.com/package/graphql-depth-limit)

---

### 3.4 Enforce Depth as a Validation Rule, Before Execution

**Impact: CRITICAL** — a nested document must be rejected before a single resolver runs

Depth is the cheapest hostile move against GraphQL: a query nested a dozen levels over lists multiplies
into exponential work, and a per-field rate limit does not stop it because every field is individually
allowed. Cap depth as a **validation rule** so the document is rejected during validation — before any
resolver, before any DataLoader, before any database work.

**Incorrect (no depth limit, or a "complexity guard" that runs inside a resolver):**

```typescript
@Injectable()
export class ComplexityGuard implements CanActivate {   // runs per resolver field, after validation
  canActivate(context: ExecutionContext): boolean {
    const info = GqlExecutionContext.create(context).getInfo();
    return this.depthOf(info.fieldNodes) <= 10;          // the nested bomb is already executing
  }
}
```

Why it is wrong: by the time a guard or resolver runs, validation has passed and execution has begun,
so the expensive path is already in flight.

**Correct (register the depth rule with the driver, so it runs with validation):**

```typescript
// infra/graphql/graphql.module.ts
import depthLimit from 'graphql-depth-limit';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  validationRules: [
    depthLimit(10),                       // 10 levels; introspection fields are ignored by default
    createComplexityRule({ /* see `op-cost-based-limits` */ }),
  ],
});
```

Why it is right: the depth check is part of document validation, so a hostile document never reaches
execution, and introspection (used by tooling) is not penalised by default.

Two things to verify against your locked stack (see `driver-version-pinning`):

- **Where the option is honoured.** `@nestjs/apollo` forwards `validationRules` to the underlying
  `ApolloServer`; confirm your installed `ApolloDriverConfig` type accepts it. If it does not (or you
  are on another driver), do the identical check in an Apollo plugin's `didResolveOperation` with
  `validate(schema, document, [...specifiedRules, rule])` — the rule is the same, only the host hook
  differs. Do **not** reach for Apollo Server v2/v3's removed `buildSchema({ validationRules })`.
- **Your real client depth.** Set the limit above your deepest legitimate query (measure it), not at a
  round number you guessed — an over-tight depth that rejects a valid screen is an outage.

Layer with the others rather than replacing them: depth is a **ceiling**, the operation limit is the
**rate** (`op-limit-layers`), and breadth (`depth-breadth-aliases`) and self-reference
(`depth-self-referential`) are separate dimensions of the same document.

Reference: [graphql-depth-limit](https://www.npmjs.com/package/graphql-depth-limit) | [Apollo Server plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins/)

---

## 4. Field Limits

**Section Impact: HIGH**

### 4.1 Give Expensive Fields an Explicit Cost

**Impact: HIGH** — the default cost of 1 hides the fields that actually cost money

Every field defaults to cost 1, which says a scalar lookup and a full-text search cost the same. They
do not. Price the genuinely expensive fields explicitly, **next to the field**, so the cost model and
the code cannot drift: a reviewer sees the price where the work happens.

`graphql-query-complexity` reads cost from either a field extension or a `@complexity` **directive**.
In code-first NestJS the directive is the clean path — declare it once and annotate fields.

**Incorrect (one flat default, so search costs the same as `id`):**

```typescript
validationRules: [
  createComplexityRule({ maximumComplexity: 1000, estimators: [simpleEstimator({ defaultComplexity: 1 })] }),
];

// in the schema — every field is priced 1, including this one
@Query(() => [Result])
search(@Args('term') term: string) { /* a full-text scan over millions of rows */ }
```

Why it is wrong: a query that calls `search` five times costs 5, the same as five `id` lookups, so the
ceiling never reflects real load.

**Correct (a `@complexity` directive, priced at the field):**

```typescript
// common/directives/complexity.directive.ts — declared once, registered in buildSchemaOptions
export const ComplexityDirective = Directive('@complexity(value: Int!, multipliers: [String!])');
```

```typescript
// infra/graphql/graphql.module.ts — the estimator chain, most specific first
import { createComplexityRule, directiveEstimator, simpleEstimator } from 'graphql-query-complexity';

GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  buildSchemaOptions: { directives: [ComplexityDirective] },   // AS5: declare it yourself
  validationRules: [
    createComplexityRule({
      maximumComplexity: 1000,
      estimators: [
        directiveEstimator(),                          // reads @complexity, if present
        simpleEstimator({ defaultComplexity: 1 }),     // everything else costs 1
      ],
    }),
  ],
});
```

```typescript
// the expensive field declares its own price, in the same file as the field
@Query(() => [Result])
@ComplexityDirective({ value: 25 })      // a search costs 25 units
search(@Args('term') term: string) { /* ... */ }
```

Why it is right: the price lives with the field, the estimator chain falls back to 1 for everything
unpriced, and the ceiling and the budget (`op-cost-based-limits`) read the same number.

Rules of thumb:

- **One estimator chain, used everywhere.** The validation ceiling and the budget charge must read the
  same cost; two chains is the classic "rejected by one rule, under-charged by the other" bug.
- **Price by the real bottleneck.** Cost approximates database/upstream work, so an aggregate, a
  cross-service join or an external API call is priced high; an indexed id lookup can even be priced
  below 1 if the estimator supports fractional values.
- **Do not price everything.** A field with no annotation falls back to the default; annotate only the
  fields where the default is a lie.
- **Verify the exported estimator names** against your pinned `graphql-query-complexity` version — the
  package has moved through forks, and `directiveEstimator` / `fieldExtensionsEstimator` are not
  guaranteed to each exist in every version (see `driver-version-pinning`).

Reference: [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) | [Apollo `@cacheControl` directives](https://www.apollographql.com/docs/apollo-server/performance/caching/)

---

### 4.2 Give a Hot Field Its Own Budget

**Impact: MEDIUM** — one abusable field should not consume the caller's whole allowance

Some fields are in a different cost class from everything around them — a full-text search, a report
generator, an export, a geospatial query. Bundling them into the global window creates a lose-lose: a
client that legitimately hammers cheap fields is blocked by one expensive call, and a client that
abuses the one hot field still consumes only `1` of the global budget. Give the hot field a **dedicated
window**, or a tracker key that includes the field coordinate, so its consumption is isolated.

**Incorrect (the hot field shares the global window):**

```typescript
@Query(() => [Result])
search() {}          // priced high for the ceiling, but the *rate* is the global window
```

Why it is wrong: the ceiling only rejects a single over-large query — a client can still run 100
medium-cost searches per minute inside the global allowance, starving every other query of its budget.

**Correct (a dedicated window for the hot field, declared in the config table):**

```typescript
// infra/rate-limit/rate-limit.module.ts — a named window for the expensive surface
throttlers: [
  { name: 'short',  ttl: seconds(1),  limit: config.get('rateLimit.short') },
  { name: 'long',   ttl: minutes(1),  limit: config.get('rateLimit.long') },
  { name: 'search', ttl: minutes(1),  limit: config.get('rateLimit.search') },  // its own budget
];
```

```typescript
// the hot field names its own window; every other field keeps the global one
@Query(() => [Result])
@RateLimit({ window: 'search' })
search(@Args() args: SearchArgs) { /* ... */ }
```

Why it is right: search abuse drains the search budget, not the client's entire allowance, and cheap
queries are unaffected by how much search a client runs.

Rules of thumb:

- **Isolate by *purpose*, not by preference.** Create a dedicated window only where the cost class is
  genuinely different; one window per field is just a config nobody can reason about.
- **The budget layer already keys by tracker** — if you prefer one window, include the field coordinate
  in the tracker key instead (`identity-tracker-hierarchy`), so `search` and `items` have separate
  counters within one window.
- **Pair the budget with a cost multiplier** (`field-list-multipliers`): the window bounds how *often*,
  the multiplier bounds how *much* each call, and the two together bound the total load.
- **The dedicated window is still a configuration value, never a literal on the decorator** — see
  `decorator-typed-options`.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [GraphQL performance](https://graphql.org/learn/performance/)

---

### 4.3 Multiply List Cost by the Requested Page Size

**Impact: HIGH** — an unbounded list is the cheapest way to amplify one field

A list field's cost is not constant — it scales with how many items the client asks for. A static cost
of 1 for `search(first: 10000)` makes the ceiling meaningless. Multiply the field's base cost by the
argument that controls the page size, and cap that argument independently.

**Incorrect (static cost, unbounded page size):**

```typescript
@Query(() => ResultConnection, { complexity: 10 })     // 10, whether `first` is 1 or 10 000
search(@Args('first', { type: () => Int }) first: number) { /* fetches `first` rows */ }
```

Why it is wrong: the same cost is charged for a page of 10 and a page of 10 000, so the client simply
asks for the biggest page and the ceiling never fires.

**Correct (a multiplier on the page-size argument, plus a hard cap):**

```typescript
// the field's cost is base x first:  @complexity(value, multipliers)
@Query(() => ResultConnection)
@ComplexityDirective({ value: 10, multipliers: ['first'] })   // cost = 10 x first
search(
  @Args() args: SearchArgs,          // `first` clamped to a hard maximum
) { /* ... */ }
```

```typescript
// dto/search.args.ts — the cap the multiplier relies on
@ArgsType()
export class SearchArgs {
  @Field(() => Int, { defaultValue: 20 })
  @IsInt() @Min(1) @Max(100)         // a page can never exceed 100 -> cost can never exceed 1000
  first = 20;

  @Field({ nullable: true })
  @IsOptional() @IsString() @MaxLength(200)
  after?: string;
}
```

Why it is right: cost tracks the work (`first` items), and the input validation caps `first`, so the
worst-case cost of the field is bounded and known — `100 × 10 = 1000`.

Rules of thumb:

- **Cap first, then multiply.** The multiplier alone is not enough: without `@Max`, `first: 999999`
  makes one field cost more than the whole budget and turns a fair limit into a denial-of-service by
  itself.
- **Match the multiplier to the argument names** the field actually exposes (`first`, `limit`, `take`);
  a multiplier on an argument that does not exist silently does nothing.
- **Cursor pagination is the default** for any list that can grow (see `type-pagination` in the
  `nestjs-graphql-structure` skill); the cap is a backstop, not a substitute for paginating.
- **Nested lists multiply again.** `boards { cards(first: 100) }` costs roughly `cards × boards`; either
  bound the parent list too, or rely on the depth cap (`depth-validation-rule`) and the default cost of
  the parent field to keep the product sane.

Reference: [GraphQL pagination](https://graphql.org/learn/pagination/) | [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity)

---

## 5. Declarative Control

**Section Impact: HIGH**

### 5.1 Make Every Skip Explicit and Greppable

**Impact: CRITICAL** — an implicit skip is an unthrottled endpoint nobody knows about

A rate limiter fails open in one dangerous direction: a field that is *meant* to be limited but is
silently not. The two causes are a missing guard binding and an implicit skip (`skipIf` predicates,
early returns, a guard that swallows errors). Make every exemption an explicit decorator that carries a
reason, so `grep -r SkipRateLimit` enumerates the entire unthrottled surface in review.

**Incorrect (skips hidden in predicates and control flow):**

```typescript
ThrottlerModule.forRoot({
  // an admin bypass nobody can find later
  skipIf: (context) => GqlExecutionContext.create(context).getContext().req.user?.isAdmin,
});

@Query(() => [Item])
async items(): Promise<Item[]> {
  if (this.config.get('disableLimits')) return this.itemsService.findAll();  // an invisible skip
  return this.itemsService.findAll();
}
```

Why it is wrong: the unthrottled paths are scattered across configuration and method bodies, so no code
search lists them and no reviewer can see the whole exposure.

**Correct (one explicit, reason-carrying decorator — and it does not disable the document ceiling):**

```typescript
// common/decorators/rate-limit.decorators.ts
export const SkipRateLimit = (reason: string) =>
  applyDecorators(SetMetadata('skipRateLimit', reason), SkipThrottle());
```

```typescript
// every exemption is one line, with a reason, in the resolver that owns it
@Query(() => String)
@SkipRateLimit('health probe — must never be throttled')
health() { return 'ok'; }

@Subscription(() => Order)
@SkipRateLimit('subscriptions are limited per-connection, not per-request')
orderCreated() { /* ... */ }
```

```bash
# review the entire unthrottled surface at a glance
grep -rn "SkipRateLimit(" src/
```

Why it is right: the exemptions are enumerated in one search, each carries its justification, and the
admin case is handled by the tracker hierarchy (`identity-tracker-hierarchy`) rather than a hidden
bypass.

Rules of thumb:

- **One global `skipIf` is legitimate; per-request identity predicates are not.** A single module-level
  `skipIf: () => !config.get('rateLimit.enabled')` is the documented kill switch
  (`setup-kill-switch`); a `skipIf` that reads `req.user.isAdmin` is exactly the hidden exemption this
  rule forbids.
- **A skip disables the counters, never the depth/cost ceiling.** `SkipThrottle()` leaves the
  validation rules alone, which is correct — an exempt endpoint can still not run a denial-of-service
  document (`depth-validation-rule`).
- **Prefer a higher window over a skip.** If an endpoint needs *more* room, give it its own window
  (`field-hot-field-budget`); a skip should be rare and argued.
- **Never swallow the store error into a skip.** An unavailable store fails open for everyone by design
  (`setup-fail-open`); it is not an endpoint-specific exemption.
- **Count them in CI.** A lint or a simple test that asserts the `@SkipRateLimit` list has not grown
  unexpectedly turns the review practice into an automated one.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [nestjs/throttler](https://github.com/nestjs/throttler)

---

### 5.2 One Declarative Surface for Policy

**Impact: CRITICAL** — one greppable shape beats per-resolver wiring that drifts

Exactly **one** way to express each rate-limiting decision:

| Decision | Decorator |
|---|---|
| Which window applies (optionally override the limit) | `@RateLimit({ window, limit? })` |
| Charge this field a higher cost | `@RateLimitCost(n)` |
| Exempt this resolver, deliberately | `@SkipRateLimit(reason)` |

Everything else — the guard, the storage, the window table — is wired once (`setup-module-wiring`). A
feature never `@UseGuards(ThrottlerGuard)` directly, never inlines a number, and never reaches into the
storage.

**Incorrect (three ways to say the same thing, numbers at call sites):**

```typescript
@Resolver(() => Auth)
@UseGuards(ThrottlerGuard)                              // wiring done per-resolver
export class AuthMutationResolver {
  @Mutation(() => TokenResponse)
  @Throttle({ default: { limit: 5, ttl: 60000 } })      // a literal, defined here and nowhere else
  login() {}

  @Mutation(() => Boolean)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })    // a different literal, same window
  forgotPassword() {}
}
```

Why it is wrong: policy is spread across resolvers as raw numbers, the guard binding is opt-in (forget
it and the resolver is unprotected), and no two limits are comparable in review.

**Correct (three small decorators over the throttler's metadata):**

```typescript
// common/decorators/rate-limit.decorators.ts
import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

export const RATE_LIMIT_COST = 'rateLimitCost';

/**
 * Select a named window from the config table; `limit` overrides only that window.
 * With no `limit`, pass NO Throttle override at all: `Throttle({ win: {} })` is a
 * partial override whose limit/ttl are undefined, so it can behave as a no-op.
 */
export function RateLimit(opts: { window: RateLimitWindow; limit?: number }) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_WINDOW, opts.window),          // for the cost layer + review
    ...(opts.limit !== undefined
      ? [Throttle({ [opts.window]: { limit: opts.limit } })]
      : []),
  );
}

/** Price this field for the cost model (read by the estimator chain). */
export const RateLimitCost = (cost: number) => SetMetadata(RATE_LIMIT_COST, cost);

/** Deliberate exemption; the `reason` is mandatory and greppable. */
export const SkipRateLimit = (reason: string) =>
  applyDecorators(SetMetadata('skipRateLimit', reason), SkipThrottle());
```

```typescript
// a resolver uses the surface, never the primitives
@Mutation(() => TokenResponse)
@RateLimit({ window: 'long' })
login(@Args('input') input: LoginInput) {}

@Query(() => [Result])
@RateLimit({ window: 'search' })
@RateLimitCost(25)
search(@Args() args: SearchArgs) {}

@Query(() => String)
@SkipRateLimit('health probe — must never be throttled')
health() { return 'ok'; }
```

Why it is right: every policy decision is one greppable line, numbers live in the config table (or the
cost model), and the guard is bound once globally so nothing is unprotected by accident.

Notes:

- **`@RateLimit` should default, not repeat.** With no `limit`, it asserts "the global window applies"
  and the field is still limited; passing `limit` is the visible, reviewable override.
- **`@SkipRateLimit` must carry a reason.** The reason is what makes a skip reviewable; a bare skip is
  an unthrottled endpoint nobody notices (see `decorator-explicit-skips`).
- **Windows are a closed set.** Type `RateLimitWindow` as a union of the configured names so a typo is a
  compile error rather than a silent no-op (`decorator-typed-options`).
- **Group them in one file** under `common/decorators/` so the whole surface is readable at once, which
  also satisfies the placement rule (`setup-file-placement`, `infra-common`).

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [nestjs/throttler](https://github.com/nestjs/throttler)

---

### 5.3 Type the Options; Never Inline Magic Numbers

**Impact: MEDIUM** — a typo in a window name is a silent no-op

A named throttler that does not exist is not an error — the guard simply has nothing to check for that
field, which reads as "limited" in review while being open in production. Make the impossible state
unrepresentable: type the window as a closed union of the names you actually configured, and let limits
come from the config table, not from literals.

**Incorrect (free-form strings and inline numbers):**

```typescript
@RateLimit({ window: 'meduim' })          // typo -> no matching throttler -> silently unchecked
@RateLimit({ window: 'long', limit: 600000 })  // a number that duplicates the config table
findAll() {}
```

Why it is wrong: the decorator reads as protection, the guard matches nothing, and the numbers drift
from the configured windows the moment someone changes the table.

**Correct (a closed union, one source of truth for numbers):**

```typescript
// common/decorators/rate-limit.types.ts — the closed set, derived from the config
export const RATE_LIMIT_WINDOWS = ['short', 'medium', 'long', 'search'] as const;
export type RateLimitWindow = (typeof RATE_LIMIT_WINDOWS)[number];

export interface RateLimitOptions {
  window: RateLimitWindow;   // a typo is now a compile error
  limit?: number;            // omit to inherit the configured limit
}

// common/decorators/rate-limit.decorators.ts
export function RateLimit(opts: RateLimitOptions) { /* ... */ }
```

```typescript
// the numbers live once, in config, and the decorator only names the window
@RateLimit({ window: 'long' })    // limit comes from config/rate-limit.config.ts
findAll() {}
```

Why it is right: an unknown window cannot be written, the limit has exactly one home
(`devops-use-config-module`), and a decorator that reads "limited" is actually limited.

Rules of thumb:

- **Keep the union and the config in sync** — ideally derive the union from the same constant array the
  module iterates, so adding a window in one place adds it in both.
- **Assert at boot** that every window name the code references exists in the module configuration.
  Throttler warns at startup when no throttler is registered; turn that warning into a startup failure.
  (See `setup-kill-switch` for the same "fail loud" principle.)
- **Defaults are policy, not magic.** If a field omits `limit`, say in one place which window's limit it
  inherits; do not let "no limit" and "the long window" look identical in review.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting)

---

## 6. Client Identity

**Section Impact: HIGH**

### 6.1 Give Anonymous Callers a Coarse, Documented Bucket

**Impact: HIGH** — an unbounded anonymous path, or one bucket every anon shares

Login, register, password reset and public queries are exactly the endpoints an attacker abuses, and
they are also the ones with no verified user. Handle the anonymous case deliberately — neither exempt it
(no protection where you need it most) nor key it under an empty identity (everyone collides into one
bucket and one caller blocks all). Use the resolved client IP, and write down the trade-off.

**Incorrect (two ways to get anonymous wrong):**

```typescript
protected async getTracker(req: Request): Promise<string> {
  if (!req.user) return 'anonymous';       // every anonymous caller shares ONE bucket
}

// or
@SkipRateLimit('public endpoints are not limited')
@Mutation(() => Boolean)
forgotPassword() {}
```

Why it is wrong: the shared bucket lets one attacker DoS all anonymous traffic (and is trivially
bypassed when they rotate IPs), and the skip removes protection from the most abusable mutations.

**Correct (a coarse, hashed IP bucket with a documented trade-off):**

```typescript
// common/guards/gql-throttler.guard.ts — the anonymous fallback, explicit
protected async getTracker(req: Request & { user?: AuthenticatedUser }): Promise<string> {
  if (req.user?.id) return `user:${req.user.id}`;      // verified -> per user
  return `ip:${hashIp(resolveClientIp(req))}`;         // anonymous -> per client IP
}
```

```text
Anonymous trade-off (documented in the module, not discovered in production):
  - a shared NAT (office/school/carrier) shares one anonymous bucket;
  - set the anonymous window generously enough for that, and rely on the
    verified per-user window for authenticated fairness;
  - login/register keep a *separate, stricter* window (`field-hot-field-budget`).
```

Why it is right: anonymous traffic is bounded, one abusive IP cannot block every anonymous caller, and
the shared-NAT consequence is a written, reviewable decision rather than a support ticket.

Rules of thumb:

- **Different windows for anonymous vs authenticated.** Anonymous gets the coarse IP bucket *and* the
  strict auth-mutation window (`@RateLimit({ window: 'auth' })` on login/register/reset).
- **Hash the IP.** The bucket key should not be a raw address; an HMAC with a server secret is enough
  (`identity-tracker-hierarchy`).
- **A stricter tracker for credential endpoints.** Consider also keying login by the submitted
  *identifier* (the email/username), so one IP cannot spray many accounts and one account cannot be
  sprayed from many IPs — combine both keys.
- **Never key on an empty value.** `user:<undefined>` or `''` collapses every caller into one bucket; the
  fallback must always produce a non-empty key.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)

---

### 6.2 Resolve the Real Client IP Behind a Proxy

**Impact: CRITICAL** — behind Cloudflare req.ip is the edge, so everyone shares one bucket

Behind Cloudflare, a load balancer or nginx, the socket IP (`req.ip`) is the **proxy**, not the
visitor. Every request then resolves to the same tracker, so the first offender exhausts the bucket for
everyone — and legitimate users are the ones blocked. Two things must both be right:

1. **Tell the framework to trust the proxy**, so `req.ip` / `req.ips` are derived from
   `X-Forwarded-For` correctly.
2. **Trust the forwarding header only if the origin is reachable only through that proxy** — otherwise
   an attacker hits the origin directly and forges the header (`edge-cloudflare-headers`).

**Incorrect (the socket IP, or the raw whole `X-Forwarded-For`):**

```typescript
protected async getTracker(req: Request): Promise<string> {
  return req.ip;                                    // Cloudflare -> the edge IP, shared by everyone
}

// or
protected async getTracker(req: Request): Promise<string> {
  return req.headers['x-forwarded-for'] as string;  // "client, proxy1, proxy2, edge" -> a whole string
}
```

Why it is wrong: `req.ip` is the edge, and the raw forwarding header is a **list**, so using it whole
keys on the entire proxy chain — different visitors share a bucket and no single one is identified.

**Correct (trust the proxy, then resolve the client deliberately):**

```typescript
// main.ts — Express: trust exactly your own proxies, not everything
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // `1` = one proxy hop; or pass your trusted CIDR list. `true` trusts ANY client to set XFF.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  await app.listen(3000);
}
```

```typescript
// common/utils/client-ip.ts — one resolver, used by the tracker
export function resolveClientIp(req: Request): string {
  // With `trust proxy` set, Express already resolved req.ips (left->right = client->nearest proxy).
  // Prefer the left-most XFF entry only because the proxy is trusted; otherwise use req.ip.
  const first = req.ips?.[0];
  return (first ?? req.ip ?? '').trim();
}
```

```typescript
// behind Cloudflare specifically, CF-Connecting-IP is a single, consistent IP
const cfIp = req.headers['cf-connecting-ip'] as string | undefined;
const ip = cfIp ?? resolveClientIp(req);   // only trustworthy if the origin is closed (see edge-cloudflare-headers)
```

Why it is right: `req.ip` now reflects the visitor, the multi-value header is handled as the list it is,
and the Cloudflare-specific header is used only when the trust boundary makes it safe.

Rules of thumb:

- **`trust proxy: true` is a security hole.** It trusts the client to set `X-Forwarded-For`; use the
  hop count or the trusted CIDR list that matches your actual topology (see `expressjs` behind proxies).
- **Fastify is different.** Set the `trustProxy` option on the adapter rather than an Express setting —
  see `driver-alignment`.
- **`X-Forwarded-For` is a list; `CF-Connecting-IP` is one IP.** The Cloudflare header is easier to use
  correctly ("a consistent format containing only one IP") but only safe behind a closed origin.
- **Verify the resolution in a test** (`test-storage-and-time`): two requests with different
  `CF-Connecting-IP` values must land in different buckets, or the whole identity layer is a no-op.

Reference: [Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html) | [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)

---

### 6.3 Track Verified User, Then API Key, Then Tenant, Then IP

**Impact: CRITICAL** — tracking by IP behind a NAT punishes whole networks

The tracker is *who the limit is charged to*. Defaulting to IP is the worst of the options: an office,
a school or a carrier NAT shares one bucket, so one abuser blocks thousands of legitimate users, and a
determined abuser rotates IPs freely. Resolve identity in a documented priority order and **never trust
a client-supplied identifier**.

Priority, most- to least-specific:

1. **Verified user** — `req.user.id`, set by the auth strategy from a validated JWT (`security-auth-jwt`).
2. **API key** — the key's identity after the key has been verified (not the raw header value).
3. **Tenant** — a shared bucket for one organisation (`tenantId`), when per-user is too granular.
4. **IP** — the fallback, resolved correctly (`identity-real-client-ip`).

Prefix the tracker by kind so two kinds never collide (`user:1` and `ip:1` must be different buckets).

**Incorrect (client-controlled identity, or IP-only):**

```typescript
protected async getTracker(req: Request): Promise<string> {
  return req.headers['x-user-id'] as string;   // client can send anything -> ban anyone, or evade
}

// or
protected async getTracker(req: Request): Promise<string> {
  return req.ip;                               // behind Cloudflare/NAT a whole network shares this
}
```

Why it is wrong: the first trusts a spoofable header, so an attacker sets it to a victim's id (or a new
id per request); the second punishes every user behind the same address.

**Correct (a verified-first hierarchy, prefixes, explicit fallback):**

```typescript
// common/guards/gql-throttler.guard.ts
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: AuthenticatedUser }): Promise<string> {
    const user = req.user;                                   // set by the JWT strategy, verified
    if (user?.id) return `user:${user.id}`;

    const apiKey = (req as any).apiKey;                      // set by the API-key guard, verified
    if (apiKey?.id) return `apikey:${apiKey.id}`;

    if (user?.tenantId) return `tenant:${user.tenantId}`;

    return `ip:${hashIp(resolveClientIp(req))}`;             // coarse, hashed, documented fallback
  }
}
```

Why it is right: the limit follows the caller across networks when their identity is known, an anonymous
caller still gets a bucket, and no client-supplied value is trusted without verification.

Rules of thumb:

- **Include the resource in the key, not only the identity.** `ops:${tracker}` and `fields:${tracker}`
  are different counters; a single unqualified key makes a field limit and an operation limit share a
  bucket (`op-limit-layers`).
- **Hash the IP** before it becomes a key (a short HMAC with a server secret) so the identifier used for
  limiting is not a stored plain address — a small privacy win that costs nothing.
- **Verified means verified.** `req.user` comes from the Passport strategy's validated payload; an
  `x-user-id` header, a JWT *claim* you did not verify, or a GraphQL variable are all untrusted.
- **The hierarchy is one function, in the guard** — not a `skipIf` in the module and a second decision in
  a resolver.

Reference: [NestJS Guards](https://docs.nestjs.com/guards) | [security/auth in NestJS](https://docs.nestjs.com/security/authentication)

---

## 7. Edge & Cloudflare

**Section Impact: MEDIUM-HIGH**

### 7.1 Enforce Cheap Limits at the Edge

**Impact: MEDIUM-HIGH** — reject floods without spending origin CPU

Two Cloudflare mechanisms do the crude work before the request reaches your Nest process, and both are
cheaper than a counter in Redis:

- **Rate limiting rules** (WAF) — configured in the dashboard/Terraform: match on path, method,
  header, IP, country; count and block/challenge. No application code. Use them for the coarse
  per-IP/path flood limit.
- **Workers Rate Limiting binding** (GA) — when your logic runs on a Worker (an API gateway in front of
  the origin, or the app itself on Workers): declare a namespace and call `limit({ key })` in code, so
  one Worker can apply **different keys and thresholds for different routes** (per user, per API key,
  per path).

**Incorrect (the origin does all the work, including the cheap part):**

```text
Cloudflare: pass-through.
origin: 600 requests/min per IP in Redis for every request, including floods and obvious bots.
```

Why it is wrong: every flood request pays full origin CPU and a Redis round-trip before it is rejected,
so the thing you are protecting is the thing doing the rejecting.

**Correct (cheap rejection at the edge, precise enforcement at the origin):**

```jsonc
// wrangler.jsonc — a Workers gateway in front of the origin
{
  "ratelimits": {
    "simple": { "limit": 600, "period": 60 }        // namespace defaults
  }
}
```

```typescript
// the Worker: per-route keys and thresholds, no origin hop for a blocked request
const key = `${request.cf?.country ?? 'xx'}:${new URL(request.url).pathname}:${ip}`;
const { success } = await env.MY_RATE_LIMITER.limit({ key });
if (!success) return new Response('rate limited', { status: 429 });
return fetch(originUrl, request);
```

```text
Rate limiting rule (dashboard): 600 requests/min per IP on /graphql -> block
```

Why it is right: floods and bots are rejected at the edge for a fraction of the cost, and the origin
spends its budget only on traffic that got through.

Rules of thumb:

- **The binding is not a globally exact counter.** Like rate limiting rules, it is designed to be cheap
  and is not a single atomic global counter across every location; treat it as approximate. For
  must-be-exact limits use a Durable Object (`edge-durable-objects-vs-kv`).
- **Key the edge limit on the same identity principle as the origin** where you can (API key or user,
  not only IP) — otherwise the edge reintroduces the shared-NAT problem.
- **Do not let the edge rule and the origin window be equal** (`op-limit-layers`): the edge is the
  coarse ceiling, the origin is the precise budget.
- **Verify GA/limits for your plan.** The Workers Rate Limiting binding went GA in late 2025 and its
  available limits differ by plan — check before you depend on a specific threshold.

Reference: [Cloudflare Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) | [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)

---

### 7.2 Trust CF-Connecting-IP Only When the Origin Is Closed

**Impact: CRITICAL** — a spoofable client-IP header is an identity bypass

Cloudflare sends `CF-Connecting-IP` on edge→origin traffic, and it carries the client IP connecting to
Cloudflare rather than the `X-Forwarded-For` list, so it is far easier to key on
(`identity-real-client-ip`). But the header is only meaningful if **the origin can be reached only
through Cloudflare.** Anyone who can hit your origin address directly can send `CF-Connecting-IP: <any
value>` and pick their own bucket, or share a victim's. So trust the header only behind a closed origin.

**Incorrect (trust the header with the origin wide open):**

```typescript
// origin is bound to 0.0.0.0:443 and its IP is discoverable
const ip = (req.headers['cf-connecting-ip'] as string) ?? req.ip;   // attacker forges the header
```

Why it is wrong: the trust boundary the header implies does not exist, so every identity decision built
on it (anonymous buckets, per-IP edge-of-limit rules) is attacker-controlled.

**Correct (close the origin first, then trust the header):**

```text
Close the origin to everything except Cloudflare, in order of strength:
  1. Cloudflare Tunnel            -> the origin has no public address at all
  2. Authenticated Origin Pulls   -> mTLS with a Cloudflare origin-pull cert; only your zone connects
  3. Firewall the origin to Cloudflare IP ranges  -> helps, but weak on its own: those ranges are
     shared by every Cloudflare customer, so another customer can still reach you and forge the header
Prefer 1 or 2; an IP allow-list is a partial measure, not the guarantee.
```

```typescript
// only now is the header trustworthy; still fall back if it is absent
const ip = (req.headers['cf-connecting-ip'] as string) ?? resolveClientIp(req);
```

Why it is right: with the origin closed, the only traffic that carries `CF-Connecting-IP` came through
your zone, so the header is a real identity; the fallback keeps non-Cloudflare deployments working.

Rules of thumb:

- **Pick one source of client IP and state it.** Either `CF-Connecting-IP` (origin closed) or
  `X-Forwarded-For` with `trust proxy` (`identity-real-client-ip`) — not both, and never the raw socket
  IP behind a CDN.
- **`True-Client-IP` is Enterprise and must be explicitly enabled** on the Cloudflare side; it is not a
  drop-in for `CF-Connecting-IP`.
- **Subrequests can carry a dummy value.** Cloudflare notes that some Worker subrequests set
  `CF-Connecting-IP` to a placeholder for security, so do not treat it as meaningful on traffic that
  did not originate at the edge.
- **Test the boundary.** A request straight to the origin that still gets a per-forged-IP bucket is the
  signal the origin is not closed.

Reference: [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/) | [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)

---

### 7.3 Layer the Edge and the Origin

**Impact: MEDIUM-HIGH** — the edge absorbs floods; the origin enforces per-identity work

There are two rate limiters worth having, and they are not the same limiter at two places:

- **Edge (Cloudflare)** — crude flood protection that never reaches your process. It knows IPs, paths,
  countries and request counts; it knows nothing about users or query cost. It is the cheapest possible
  rejection.
- **Origin (this skill)** — precise, identity-aware, cost-aware enforcement: per user, per tenant, per
  operation cost, per field. It knows the work.

The edge keeps the origin from melting under a flood; the origin decides what a *known* caller may
spend. Configure both, but keep them distinct (`op-limit-layers`), and keep the origin's enforcement on
even when the edge is present.

**Incorrect (only the edge, assuming it is enough):**

```text
Cloudflare rate limiting rule: 300 req/min per IP on /graphql.
origin: no throttler, no depth limit.
```

Why it is wrong: the edge cannot see that one authenticated user is running a 900-cost query every
second — those are 60 "requests" a minute, comfortably under the IP limit, and each one is a database
disaster. It also cannot tell two users behind one NAT apart.

**Correct (edge for floods, origin for work, with the trust boundary made explicit):**

```text
Edge (Cloudflare rate limiting rules):
  - 600 requests/min per IP on /graphql          -> absorbs bot floods
  - "Under Attack" / managed challenge during an active incident

Origin (this skill):
  - depth/cost ceiling on every document          -> `depth-validation-rule`
  - 120 operations/min per tracker                -> `op-count-operations`
  - per-user cost budget                          -> `op-cost-based-limits`
  - dedicated window for login/search             -> `field-hot-field-budget`
```

Why it is right: a flood is stopped before it costs origin CPU, and a flood that does get through is
still bounded by identity and cost, not by a per-IP count.

Two traps:

- **The edge can be bypassed if your origin IP leaks.** An attacker who learns the origin address talks
  to it directly and skips every edge rule, so the origin must enforce on its own regardless
  (`edge-cloudflare-headers` closes the origin).
- **The edge adds latency you must measure.** A very tight edge rule on every request can be slower than
  the request it protects; keep the edge rules coarse and let the origin do the fine-grained work.

Reference: [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) | [GraphQL performance](https://graphql.org/learn/performance/)

---

### 7.4 Use Durable Objects, Not KV, for Exact Counters

**Impact: MEDIUM-HIGH** — KV is eventually consistent, so a counter built on it is wrong

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

---

## 8. Errors & Observability

**Section Impact: MEDIUM**

### 8.1 Return a GraphQL Error with Extensions, Not a Bare 429

**Impact: MEDIUM** — clients read the errors array, so a status code alone is invisible

A GraphQL client parses `body.errors`; it does not branch on the HTTP status. If your limiter throws a
bare `429` whose only signal is a status code, a well-behaved client cannot tell a rate limit from any
other failure, and it cannot know when to retry. Shape the rejection as a **`GraphQLError` with stable
`extensions`** — a code and a retry hint — and *also* set the transport-level status/headers for
infrastructure in front.

**The status is your filter's call, not the spec's.** With Apollo an *execution* error returns
**HTTP 200** with the failure in `body.errors`, but a guard-thrown `HttpException` can be mapped to a
different status by your exception filter set. Decide the status you want, then assert the one you
actually get (`test-e2e-limits`) instead of assuming 200.

**Incorrect (an opaque exception, or a shaped error with no stable code):**

```typescript
if (isBlocked) throw new HttpException('Too many requests', 429);
// the client sees `errors: [{ message: 'Too many requests' }]` — no code, no retry hint
```

Why it is wrong: the message is prose, there is no machine-readable code, and nothing says how long to
wait, so clients retry immediately and worsen the problem.

**Correct (a stable code and a retry hint in `extensions`):**

```typescript
// common/exceptions/rate-limited.exception.ts
import { GraphQLError } from 'graphql';

export class RateLimitedException extends GraphQLError {
  constructor(detail: { limit: number; retryAfterMs: number; window: string }) {
    super('Rate limit exceeded', {
      extensions: {
        code: 'RATE_LIMITED',              // stable, client-branchable
        limit: detail.limit,
        window: detail.window,
        retryAfterMs: detail.retryAfterMs, // the client's backoff input
      },
    });
  }
}
```

```typescript
// the guard throws it; the transport answer carries the status/headers too
if (isBlocked) throw new RateLimitedException({ limit, retryAfterMs: timeToBlockExpire * 1000, window });
```

```jsonc
// what the client actually receives (HTTP 200, error inside the body)
{
  "data": null,
  "errors": [
    { "message": "Rate limit exceeded",
      "extensions": { "code": "RATE_LIMITED", "limit": 100, "window": "long", "retryAfterMs": 42000 } }
  ]
}
```

Why it is right: the client branches on `code === 'RATE_LIMITED'` and sleeps `retryAfterMs`, and the
error is consistent with every other GraphQL error in the API.

Rules of thumb:

- **One code per condition.** Use `RATE_LIMITED` for counters, a distinct code (e.g. `QUERY_TOO_COMPLEX`
  / `QUERY_TOO_DEEP`) for the depth/cost ceiling, so a client can tell "slow down" from "this query is
  not allowed at all".
- **Depth/cost rejections are not rate limits.** They are validation errors — do not put them behind
  `RATE_LIMITED` or clients will retry a query that can never succeed.
- **Map it once, centrally.** A `@Catch()` filter or the guard itself shapes every rejection; do not
  hand-build the error in each resolver (`error-use-exception-filters` in the
  `nestjs-best-practices` skill).
- **Keep the HTTP 429/`Retry-After` too** for CDNs, load balancers and non-GraphQL health tooling
  (`obs-headers`).

Reference: [GraphQL serving over HTTP — errors](https://graphql.org/learn/serving-over-http/#errors) | [NestJS Exception filters](https://docs.nestjs.com/exception-filters)

---

### 8.2 Publish RateLimit and Retry-After Headers

**Impact: MEDIUM** — clients can only back off if you tell them how much is left

A limit a client cannot see is a limit it will hit by accident. Emit the remaining budget on every
response and the wait time on a rejection. The throttler does most of this for you — but only if the
guard can reach the response object, which is exactly why the GraphQL guard must resolve `res` from the
context (`setup-graphql-guard`).

**Incorrect (headers silently absent, because the guard has no response):**

```typescript
protected getRequestResponse(context: ExecutionContext) {
  const gql = GqlExecutionContext.create(context);
  return { req: gql.getContext().req, res: undefined };   // no response -> no headers set
}
// and: ThrottlerModule.forRoot({ setHeaders: false })     // headers switched off globally
```

Why it is wrong: the throttler skips setting headers when `setHeaders` is false or the response is
missing, so clients get no remaining/reset information and no `Retry-After`.

**Correct (headers on, and the GraphQL response passed through):**

```typescript
// infra/rate-limit/rate-limit.module.ts — leave header emission on (it is the default)
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    throttlers: [ /* named windows */ ],
    setHeaders: true,                     // X-RateLimit-* on every response
    errorMessage: (_ctx, detail) =>
      `Rate limit exceeded. Retry after ${detail.timeToBlockExpire}s.`,
  }),
});
```

```text
What the client sees (named throttlers get a name suffix):
  X-RateLimit-Limit-long: 600
  X-RateLimit-Remaining-long: 512
  X-RateLimit-Reset-long: 1745000123
  Retry-After: 42            # only on a rejected request (429 / RATE_LIMITED error)
```

Why it is right: a client reads `Remaining` to slow itself down proactively and `Retry-After` to back
off correctly after a rejection, instead of retrying into the limit.

Rules of thumb:

- **Make sure the response object exists in the GraphQL context.** Express: `context: ({ req, res }) =>
  ({ req, res })`. Fastify/Mercurius: `{ request, reply }` and a guard that maps them
  (`driver-alignment`).
- **The retry hint belongs in both places.** The header serves HTTP-aware infrastructure; the
  `extensions.retryAfterMs` serves the GraphQL client (`obs-error-shape`). Emit both from the same value.
- **Named throttlers suffix their headers** (`-short`, `-long`, `-search`); document which window is
  which so clients are not guessing.
- **If you standardise on the draft `RateLimit` header**, do it as a deliberate translation layer rather
  than by hand — the throttler emits its own `X-RateLimit-*` set.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [MDN Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After)

---

### 8.3 Count Rejections and Surface a Per-Request Trace

**Impact: MEDIUM** — you cannot tune limits you are not measuring

A limiter you cannot see is a limiter you will set wrong. Emit **counters** that prove whether the
limits are working, and a **per-request trace** (dev-only) that shows exactly which limit fired, on which
key, at what cost. Never log formatted strings you cannot aggregate — emit typed events and counters, the
same discipline the `nestjs-graphql-swr-caching` skill applies to cache decisions
(`observability-metrics-and-tests`).

Track, at minimum:

- `rate_limit.allowed` / `rate_limit.blocked` — by window and by tracker kind (`user`/`ip`/`key`).
- `rate_limit.storage_errors` — the fail-open signal (`setup-fail-open`); alert on it.
- `query.rejected_depth` / `query.rejected_complexity` — the ceiling firing (`depth-validation-rule`).
- `query.cost` histogram — the distribution that tells you where to set `maximumComplexity` and budgets.
- `rate_limit.top_trackers` (bounded) — who is hitting the wall, for tuning and abuse response.

**Incorrect (unstructured logs, no counters, no trace):**

```typescript
this.logger.warn(`rate limited ${req.ip} on ${info.fieldName}`);  // cannot aggregate or alert
```

Why it is wrong: you cannot compute a block rate, cannot alert on store failures, and cannot answer the
only question that matters when tuning — *which* limit fired and *how close* legitimate traffic is to it.

**Correct (typed counters plus a per-request trace in CLS):**

```typescript
// common/interceptors/rate-limit-trace.interceptor.ts — aggregate per request
@Injectable()
export class RateLimitTraceInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService, private readonly config: ConfigService) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle();
  }
}

// during the request, record structured events into CLS (never a log string)
cls.set('rateLimitTrace', [
  { window: 'long', tracker: 'user:42', cost: 25, outcome: 'allowed', remaining: 512 },
]);

// at the end, dev-only: expose the trace as a GraphQL extension
// extensions.rateLimit = { ...events, cost }
```

```typescript
// counters — one call per decision, so the dashboard exists
metrics.increment('rate_limit.blocked', { window, trackerKind });
metrics.observe('query.cost', cost);
```

Why it is right: the block rate and cost distribution are queryable, a store outage is alertable, and a
single request can be inspected — with the same structured-event shape the sibling caching skill uses.

Rules of thumb:

- **Trace is dev-only, counters are always on.** Never ship the full per-request trace to production;
  do keep the counters.
- **Assert on outcomes in tests, not on the counters' internals** (`test-storage-and-time`) — the
  metrics are for humans, the behaviour is for the test.
- **A rising `blocked` count is not automatically good.** High blocks can mean a limit is too tight; the
  `allowed`/`blocked` ratio against `query.cost` is the signal you tune on.
- **Reuse the tracing seam you already have.** If the app uses CLS for identity (`setup-identity-context`
  in the caching skill), the trace rides the same context; do not add a second mechanism.

Reference: [NestJS Interceptors](https://docs.nestjs.com/interceptors) | [GraphQL performance monitoring](https://graphql.org/learn/performance/)

---

## 9. Testing

**Section Impact: MEDIUM**

### 9.1 Test the Rules on Documents, Table-Driven

**Impact: MEDIUM** — the depth/cost rules are pure functions of a document — test them as such

The depth and complexity rules take a **document** and return errors; they need no HTTP, no guard and no
storage. Test them directly with `validate(schema, document, [...specifiedRules, rule])` in a
table-driven suite that pins both sides of the boundary: documents that must pass, and documents that
must be rejected, with the exact error. This is where "clear and without bug" is actually proven — a
depth cap that rejects a legitimate screen, or a cost model that under-prices a list, is caught here and
nowhere else.

**Incorrect (only an integration test that fires one nested query):**

```typescript
it('rejects a deep query', async () => {
  const res = await gql(app, deepQuery);
  expect(res.body.errors).toBeDefined();       // does not say why, or where the boundary is
});
```

Why it is wrong: it tests one shape, cannot distinguish a depth rejection from a 500, and never checks
that legitimate nesting still passes.

**Correct (table-driven: both sides of the boundary, and the reason):**

```typescript
// infra/graphql/depth-limit.spec.ts
const cases = [
  { name: 'accepts a legitimate deep query', doc: legitDeepQuery, depth: 10, ok: true },
  { name: 'rejects one level past the cap', doc: oneTooDeep, depth: 10, ok: false },
  { name: 'rejects a self-referential cycle', doc: friendsOfFriendsOfFriends, depth: 10, ok: false },
  { name: 'ignores introspection depth', doc: introspectionQuery, depth: 10, ok: true },
];

describe('depth limit rule', () => {
  it.each(cases)('$name', ({ doc, depth, ok }) => {
    const errors = validate(schema, parse(doc), [...specifiedRules, depthLimit(depth)]);
    expect(errors.length === 0).toBe(ok);
    if (!ok) expect(errors[0].message).toMatch(/exceeds maximum operation depth/i);
  });
});
```

```typescript
// infra/graphql/complexity.spec.ts — pin the price of a list at both ends
const costCases = [
  { name: 'prices a scalar query at its base cost', doc: '{ me { id } }', cost: 3 },
  { name: 'multiplies a list by `first`', doc: '{ search(first: 50) { id } }', cost: 500 },
  { name: 'rejects a query above the ceiling', doc: '{ search(first: 100) { id } }', over: 1000 },
];

it('prices and caps by the same estimator chain', () => {
  const onComplete = jest.fn();
  const rule = createComplexityRule({
    maximumComplexity: 1000,
    estimators: [directiveEstimator(), simpleEstimator({ defaultComplexity: 1 })],
    onComplete,
  });
  const errors = validate(schema, parse(costCases[1].doc), [...specifiedRules, rule]);
  // onComplete receives { [operationName]: cost }, not a single number
  const [reported] = onComplete.mock.calls.at(-1) as [Record<string, number>];
  expect(Object.values(reported)).toContain(costCases[1].cost);
  expect(errors).toHaveLength(0);
});
```

Why it is right: every boundary is pinned with a document, a legitimate query is proven to pass, the
rejection reason is asserted, and the run is pure and instant.

Rules of thumb:

- **Both sides of every boundary.** For each limit, one document just under and one just over — a suite
  that only tests rejections will happily ship a limit that rejects everything.
- **Assert the error message/code**, not merely that *an* error occurred, so a depth rejection cannot be
  mistaken for a complexity rejection.
- **Test the estimator chain directly** for the list multiplier (`field-list-multipliers`) — that is the
  single most likely place for a silent pricing bug.
- **The same table becomes documentation.** Name each case for the rule it proves; a reviewer learns the
  limits from the test names.
- **This is not a substitute for the e2e check** (`test-e2e-limits`) — the rule being correct and the rule
  being wired are two different failures.

Reference: [graphql-js validate](https://graphql.org/graphql-js/validation/) | [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity)

---

### 9.2 Prove the Limit End-to-End Against the Real Endpoint

**Impact: MEDIUM** — a correct rule wired in the wrong place still does nothing

Unit tests prove the rule and the guard; only an e2e test proves the **wiring** — that the guard is bound
globally, the validation rules are registered with the driver, and the rejection comes back to the client
as a `RATE_LIMITED` error with headers. A document sent to a real Nest app booted from `AppModule` and
POSTed to the GraphQL endpoint is the end of the argument. Use the repository's shared helpers rather than
a one-off setup (`test-e2e-supertest` and `conventions-test-fixtures` in the sibling skills).

**Incorrect (an e2e that boots a partial app, or asserts on the wrong layer):**

```typescript
const res = await request(app.getHttpServer()).post('/graphql').send({ query: '{ me { id } }' });
expect(res.status).toBe(429);      // Apollo returns HTTP 200 for execution errors; error is in the body
```

Why it is wrong: it asserts an HTTP status GraphQL does not use for an execution error, and if it boots a
test module that only registers the rule (not the guard), it proves the rule in isolation again.

**Correct (boot the real AppModule, drive the real endpoint, assert the contract):**

```typescript
// test/rate-limit.e2e-spec.ts
import { gql } from './helpers/graphql';    // the shared POST helper (`conventions-test-fixtures`)

describe('rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMIT_STORAGE)          // your throttler storage token (see `setup-storage`)
      .useValue(new InMemoryThrottlerStorage())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('rejects the request past the window with a RATE_LIMITED error', async () => {
    const attempts = Array.from({ length: 6 }, () => gql(app, `mutation { login(input: $in) { accessToken } }`, { in: BAD_LOGIN }));
    const results = await Promise.all(attempts);   // or sequential, for a stable boundary
    const rejected = results.at(-1)!;
    expect(rejected.body.errors?.[0].extensions.code).toBe('RATE_LIMITED');
    expect(rejected.body.errors?.[0].extensions.retryAfterMs).toBeGreaterThan(0);
    expect(rejected.headers['retry-after']).toBeDefined();
  });

  it('rejects a document past the depth cap with a validation error', async () => {
    const res = await gql(app, deepQuery);
    expect(res.body.errors?.[0].extensions.code).toBe('QUERY_TOO_DEEP');
    expect(res.body.errors?.[0].extensions.code).not.toBe('RATE_LIMITED');   // not a rate limit
  });
});
```

Why it is right: it exercises the whole chain — global guard binding, GraphQL context, driver-registered
validation rules, error shape and headers — which is exactly the class of bug the unit tests cannot see.

Rules of thumb:

- **Override only the storage** for determinism; keep the real guard, the real module wiring and the real
  validation rules under test (`test-mock-external-services`).
- **Sequential requests for a stable boundary**, concurrency only when you are testing the race
  (`op-cost-based-limits` cost accounting under load).
- **Assert the transport contract explicitly**: `extensions.code`, `retryAfterMs`, the `Retry-After`
  header (`obs-error-shape`, `obs-headers`).
- **Distinguish the rejections** — a rate limit and a depth rejection must carry different codes, or the
  e2e test hides a rule that is rejecting valid traffic.
- **Keep the e2e in `test/`**, unit tests co-located with their subject (`conventions-testing`).

Reference: [NestJS e2e testing](https://docs.nestjs.com/fundamentals/testing#end-to-end-testing) | [GraphQL over HTTP](https://graphql.org/learn/serving-over-http/)

---

### 9.3 Test with an In-Memory Store and Frozen Time

**Impact: MEDIUM** — deterministic limit tests without Redis or sleeping

A rate-limit test with a real Redis and real wall-clock time is slow, flaky and order-dependent. Test the
**behaviour** with the throttler's in-memory storage and **fake timers**: assert that the Nth call is
allowed, the (N+1)th is rejected, and that after advancing the clock the caller is allowed again. Never
assert on a Redis key's existence or name — that is implementation-bound and proves nothing about the
limit (`observability-metrics-and-tests` in the `nestjs-graphql-swr-caching` skill makes the same point
for the cache).

**Incorrect (a real store, real time, and assertions on internals):**

```typescript
it('blocks after 5', async () => {
  for (let i = 0; i < 5; i++) await login();
  await expect(login()).rejects.toThrow();
  expect(await redis.exists('rl:default:1.2.3.4')).toBe(1);   // brittle, driver-bound
  // also relies on being the only test using that IP -> order-dependent
});
```

Why it is wrong: it needs a live Redis, leaks between tests through shared keys, asserts on the counter's
storage shape rather than the limit, and cannot test the window without real sleeping.

**Correct (in-memory store, frozen time, isolated trackers):**

```typescript
// test/helpers/rate-limit.ts — one module factory for every test
export async function createRateLimitTestingModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([
        { name: 'long', ttl: 60_000, limit: 5 },   // in-memory storage by default
      ]),
    ],
    providers: [
      { provide: APP_GUARD, useClass: GqlThrottlerGuard },
      { provide: ConfigService, useValue: { get: (k: string) => ({ 'rateLimit.enabled': true })[k] } },
    ],
  }).compile();
}

describe('GqlThrottlerGuard', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('allows the limit, then blocks, then recovers after the window', async () => {
    const guard = makeGuard({ tracker: 'user:42' });

    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(gqlContext())).resolves.toBe(true);
    }
    await expect(guard.canActivate(gqlContext())).rejects.toBeInstanceOf(RateLimitedException);

    jest.advanceTimersByTime(60_001);              // past the window
    await expect(guard.canActivate(gqlContext())).resolves.toBe(true);
  });

  it('keeps separate trackers independent', async () => {
    await exhaust('user:42', 5);
    await expect(canActivate('user:7')).resolves.toBe(true);   // a different user is untouched
  });

  it('resolves two client IPs into two buckets', async () => {
    await exhaustIp('203.0.113.1', 5);
    await expect(canActivateIp('198.51.100.9')).resolves.toBe(true);  // `identity-real-client-ip`
  });
});
```

Why it is right: the test runs in milliseconds with no infrastructure, isolates every tracker, and proves
the three behaviours that matter — the limit fires, the window resets, and identities do not bleed.

Rules of thumb:

- **Assert outcomes, not keys.** "Blocked on the 6th call" is the contract; the storage key is an
  implementation detail.
- **One unique tracker per test** (a fresh `user:<uuid>`) so tests never share a bucket and order does
  not matter.
- **Freeze time; never `sleep`.** `jest.useFakeTimers()` + `advanceTimersByTime` tests the window
  instantly and deterministically.
- **Test the fail-open path too**: point the store at a stub whose `increment` throws and assert the
  request is allowed and the `storage_errors` counter moved (`setup-fail-open`).
- **Mock only at the boundary.** Mock the storage or Redis client, never the guard's own logic
  (`test-mock-external-services` in the `nestjs-best-practices` skill).

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing) | [Jest timer mocks](https://jestjs.io/docs/timer-mocks)

---

## 10. Drivers & Versions

**Section Impact: MEDIUM**

### 10.1 Match the Guard to the Driver's Context Shape

**Impact: MEDIUM** — a guard written for Express silently breaks on Fastify

The GraphQL guard must find the underlying request and response, and that shape depends on the HTTP
platform, not on the GraphQL driver alone:

- **Express** (the common `@nestjs/apollo` setup): the context is `{ req, res }`.
- **Fastify / Mercurius**: the context is `{ request, reply }`.

A `getRequestResponse` hard-coded to Express keys the limit off `undefined` on Fastify — the failure mode
is "no limits anywhere", not a crash, so it ships. Write the accessor for the platform you actually run,
and verify it in the e2e test (`test-e2e-limits`).

**Incorrect (Express-shaped accessor on a Fastify deployment):**

```typescript
protected getRequestResponse(context: ExecutionContext) {
  const ctx = GqlExecutionContext.create(context).getContext();
  return { req: ctx.req, res: ctx.res };   // Fastify -> both undefined -> tracker/key are wrong
}
```

Why it is wrong: on Fastify the request lives at `ctx.request` and the reply at `ctx.reply`, so the guard
tracks nothing meaningful and every limit is effectively absent.

**Correct (the accessor matches the platform, and the context provides the objects):**

```typescript
// common/guards/gql-throttler.guard.ts — Express
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context).getContext();
    return { req: ctx.req, res: ctx.res };
  }
}
```

```typescript
// common/guards/gql-throttler.guard.ts — Fastify / Mercurius
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context).getContext();
    return { req: ctx.request, res: ctx.reply };   // Fastify names
  }
}
```

```typescript
// infra/graphql/graphql.module.ts — the context must expose whatever the guard reads
// Express:
context: ({ req, res }: { req: Request; res: Response }) => ({ req, res }),
// Fastify / Mercurius:
context: (request: FastifyRequest, reply: FastifyReply) => ({ request, reply }),
```

Why it is right: the guard reads the objects that actually exist for the running platform, so the tracker
and the response headers work the same way on either.

Rules of thumb:

- **Pick the driver, then the accessor.** Apollo-on-Express and Mercurius-on-Fastify both need the
  override; only the property names differ (`driver-apollo-validation` covers the validation-rule side).
- **`trust proxy` is also driver-specific.** Express sets it on the instance; Fastify takes a
  `trustProxy` option — the same for the client-IP resolution (`identity-real-client-ip`).
- **Assert it in e2e.** A unit test with a hand-built context will not catch a platform mismatch; the e2e
  test against the real app will (`test-e2e-limits`).
- **Do not branch at runtime on the platform inside the guard.** Choose the accessor once, at the edge of
  the app, so a misconfiguration is a compile-time or boot-time problem, not a silent no-limit.

Reference: [NestJS GraphQL quick start](https://docs.nestjs.com/graphql/quick-start) | [nestjs/throttler](https://github.com/nestjs/throttler)

---

### 10.2 Register Validation Rules Where the Driver Reads Them

**Impact: MEDIUM** — the pre-v3 buildSchema option is gone; the plugin hook always works

Depth and complexity rules are GraphQL **validation rules**, so they must be handed to the layer that
validates the document — the `ApolloServer` options, not a resolver and not the schema builder. Nest's
`@nestjs/apollo` forwards `validationRules` from the `GraphQLModule` config to `ApolloServer`. Two things
drift here and must be verified against your installed version (`driver-version-pinning`):

- the removed `buildSchema({ validationRules: [...] })` form (Apollo Server v2/v3) — do **not** use it;
- whether your `ApolloDriverConfig` type still accepts `validationRules`.

If the option is not forwarded, the guaranteed path is an Apollo **plugin**: validate in
`didResolveOperation` and throw. Same rule, different host hook.

**Incorrect (config that no longer exists, or rules strapped to the wrong place):**

```typescript
// removed in Apollo Server v3 — silently ignored, so nothing is validated
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  buildSchemaOptions: { validationRules: [depthLimit(10)] },
});
```

```typescript
// rules inside a resolver -> the document already executed past validation
@Query(() => [Item])
async items(@Context() ctx: GqlContext) {
  validate(ctx.schema, ctx.document, [depthLimit(10)]);   // too late
  return this.itemsService.findAll();
}
```

Why it is wrong: the first is dead config (the schema builds, the limit does not exist); the second runs
after the document has already been accepted and begun executing.

**Correct (rules on the server options; the plugin as the portable fallback):**

```typescript
// infra/graphql/graphql.module.ts — the primary form; verify your version forwards it
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  validationRules: [depthLimit(10), createComplexityRule({ /* ... */ })],
  buildSchemaOptions: { directives: [ComplexityDirective] },   // directives still go here
});
```

```typescript
// infra/graphql/depth-limit.plugin.ts — the fallback that works on any Apollo version
import { specifiedRules, validate } from 'graphql';

export const depthRulePlugin = (maxDepth: number): ApolloServerPlugin => ({
  async requestDidStart() {
    return {
      async didResolveOperation({ document, schema, request }) {
        const rule = depthLimit(maxDepth);
        const errors = validate(schema, document, [...specifiedRules, rule]);
        if (errors.length) throw errors[0];       // `obs-error-shape` shapes the client-facing error
      },
    };
  },
});
```

Why it is right: the rules run inside validation (before any resolver), and the plugin form is independent
of whether the driver forwards the option — so the limit exists on every Apollo version.

Rules of thumb:

- **`validationRules` and `buildSchemaOptions.directives` are different slots.** Directives (the
  `@complexity` annotation) are declared in `buildSchemaOptions`; the rules that enforce the limits go in
  `validationRules`. Putting an enforcement rule in `buildSchemaOptions` is the classic dead config.
- **Apollo Server 5 changed directive declaration** — it no longer auto-inserts a directive, so a
  directive used on a field must be declared (`buildSchemaOptions.directives`) or code-first generation
  drops it (`field-cost-weights`).
- **Confirm the boundary in e2e**, not by reading config: a document that should be rejected must be
  rejected (`test-e2e-limits`).
- **On Mercurius**, the equivalent is the driver's own validation/plugin hooks — same rule, wired where
  that driver reads it (`driver-alignment`).

Reference: [Apollo Server plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins/) | [GraphQL Armor](https://escape.tech/graphql-armor/)

---

### 10.3 Pin the Stack; Validate Options Against Installed Types

**Impact: MEDIUM** — a renamed option is a silent no-op, not an error

Every package in this skill has moved recently, and the failure mode of an outdated option name is **not**
a crash — the option is accepted and ignored, so you believe you configured a limit that does not exist.
Pin the stack, and before relying on any option here, open the installed package's type definitions (or
its README at your pinned version) and confirm the option still exists and means what you expect.

Known drift to check:

- **`@nestjs/throttler` v5 vs v6.** v5 removed the per-limit `getLimit()` override (the v4 API) in favour
  of named throttlers plus `@Throttle`. `ttl` is **milliseconds**; use the `seconds()`/`minutes()`
  helpers. Newer options (`skipIf`, `setHeaders`, `errorMessage`, per-set `getTracker`/`generateKey`)
  must be confirmed against your version. `forRoot()` with no throttlers registers **none** and warns at
  boot — treat that warning as an error (`decorator-typed-options`).
- **`@nest-lab/throttler-storage-redis`** peer-depends on `@nestjs/throttler >= 6`; on v5 either upgrade
  or implement `ThrottlerStorage` yourself (`setup-storage`).
- **`graphql-query-complexity`** has moved through forks (including an ESM fork); the exported estimator
  names (`directiveEstimator`, `fieldExtensionsEstimator`, `simpleEstimator`) and the rule factory name
  are **not** guaranteed identical across versions — confirm which exist before quoting one
  (`field-cost-weights`).
- **`graphql-depth-limit` vs `graphile/depth-limit`** are different packages with different options; the
  first has no self-referential notion, the second does (`depth-self-referential`).
- **Apollo Server 4 vs 5.** v5 requires directives to be declared explicitly; `validationRules` handling
  and plugin APIs differ from v2/v3, where `buildSchema({ validationRules })` was removed
  (`driver-apollo-validation`). `@nestjs/apollo` v14 targets AS5.
- **Express v5 is the default in Nest 11**; `trust proxy` semantics and behind-proxy handling are worth
  re-checking when you upgrade (`identity-real-client-ip`).

**Incorrect (relying on remembered names):**

```typescript
// copied from an older release: the option no longer exists / was renamed
ThrottlerModule.forRoot([{ ttl: 60, limit: 5 }]);   // 60 what? and no named throttler
// a guard that overrides `getLimit()` -> method removed in v5; override does nothing
```

Why it is wrong: the limit is not what the code says — a dropped `getLimit()` override means the
configured limit silently applies, and a `ttl: 60` is 60 ms, so the window is a fraction of a second.

**Correct (pin, then verify against the installed definitions):**

```jsonc
// package.json — pin the rate-limiting stack tightly
{
  "@nestjs/throttler": "6.x",
  "@nest-lab/throttler-storage-redis": "1.x",
  "graphql-depth-limit": "1.x",
  "graphql-query-complexity": "1.x",
  "@nestjs/apollo": "14.x",
  "@apollo/server": "5.x"
}
```

```bash
# the verification step before adopting an option from this skill
grep -R "skipIf\|setHeaders\|generateKey" node_modules/@nestjs/throttler/dist --include=*.d.ts
```

Why it is right: a pinned stack makes this skill's guidance reproducible, and a mismatch is caught at
install/typecheck rather than in production where a limit quietly does not apply.

Rules of thumb:

- **Types are the contract.** If the option is not in the installed `.d.ts`, the code will not
  type-check — and if it type-checks but the value is ignored, you have found a version drift to pin
  against.
- **Read the changelog for the two packages that gate everything else**: `@nestjs/throttler` (the guard
  and options) and `@nestjs/apollo` (where the rules are wired).
- **Re-verify after an upgrade** with the e2e test (`test-e2e-limits`) — a passing upgrade that silently
  stops limiting is the exact failure this rule exists to prevent.

Reference: [@nestjs/throttler releases](https://github.com/nestjs/throttler/releases) | [Apollo Server v4 migration](https://www.apollographql.com/docs/apollo-server/migration/)

---

## References

- https://docs.nestjs.com/security/rate-limiting
- https://docs.nestjs.com/graphql/resolvers
- https://docs.nestjs.com/graphql/other-features
- https://github.com/nestjs/throttler
- https://www.npmjs.com/package/@nest-lab/throttler-storage-redis
- https://www.npmjs.com/package/graphql-depth-limit
- https://github.com/graphile/depth-limit
- https://github.com/slicknode/graphql-query-complexity
- https://www.apollographql.com/docs/apollo-server/
- https://escape.tech/graphql-armor/
- https://graphql.org/learn/performance/
- https://expressjs.com/en/guide/behind-proxies.html
- https://developers.cloudflare.com/waf/rate-limiting-rules/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/durable-objects/
- https://developers.cloudflare.com/fundamentals/reference/http-headers/
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
- https://redis.io/commands/incr

---

*Generated by build-agents.ts from `rules/` — edit the rules, not this file.*
