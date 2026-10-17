---
name: nestjs-graphql-swr-caching
description: Use when caching GraphQL reads in a NestJS (code-first) app — wiring a stale-while-revalidate (SWR) cache module once, deciding what to cache and where to mount it (service, field, operation, or CDN), and keeping it leak-safe. Triggers when you need SWR, single-flight dedupe, tag invalidation, per-user vs public scoping, cache observability, a stampede or blocking-miss at TTL expiry, a shared-key data leak, a dev/ops switch that disables caching entirely, or a one-time setup reference (module, file placement, storage, referencesTTL/GC, caller identity, decorator runtime, fail-open).
license: MIT
metadata:
  author: Zoha
  version: "2.2.0"
---

# GraphQL SWR Caching (NestJS, code-first)

## Overview

Cache by **intent, not mechanism**. One policy shape, one observable event stream, one per-request trace. Mount at the **service level** by default; escalate to field / operation / transport only when measured.

Three hard truths that shape every decision:

1. **Apollo Server has no built-in stale-while-revalidate.** Its `responseCachePlugin` is TTL-only and operation-level. Real SWR comes from your own layer (`async-cache-dedupe`, or `mercurius-cache` on the Mercurius driver) or from a CDN.
2. **Scope defaults to `public`.** A public entry is shared verbatim by every caller, so it is only correct when the result is byte-identical for all of them. The moment a value varies by caller it **must** be marked `perUser` — or it leaks.
3. **Nest interceptors do not wrap service methods, and `@nestjs/cache-manager`'s `CacheInterceptor` does not work in GraphQL.** So the service-level decorator you want is a method wrapper over a dedupe engine — not a framework interceptor.

## When to Use

- NestJS GraphQL (code-first) where resolvers/services repeatedly hit a DB or upstream API.
- You need to remove latency spikes and stampedes at TTL expiry (true SWR).
- You need to reason about multi-user cache safety / leakage.
- You need visibility into hit / stale / miss decisions.
- You need to turn caching off entirely — dev, CI, or an incident — with one flag (see Section 1, `setup-disable-switch`).
- You are wiring the caching capability into an app for the first time (see Section 1).

**When NOT to use:**

- You are already behind a CDN doing response caching for public GET/APQ traffic — start there.
- Write/mutation paths, or per-user data with no reuse and low read amplification (caching adds risk for little gain).

## The Callback Contract

`key`, `@CacheTag`, and `@InvalidateTags` take functions. Get their arguments right or the cache
silently misses and the tags silently fail to purge.

| Callback | Signature | What `args` is |
|---|---|---|
| `key` | `(args, ctx) => unknown[] \| Promise<unknown[]>` | the method's **argument list, in call order** — `args[0]`, never `args.id` |
| `@CacheTag` | `(result, args) => string[] \| null` | the same list; `result` is the method's return value |
| `@InvalidateTags` | `(result, args) => string[]` | the same list; `result` is the write's return value |

- **Positional, not named.** For `getTitle(id: string)`, the id is `args[0]`.
- **Result comes first** on both tag callbacks. The raw engine's own `references` is
  `(args, key, result)` — different order, different first argument (see `driver-async-cache-dedupe`).
- **`ctx`** (`userId`, `tenantId`, `locale`, plus `gen`) is request-derived and assembled by
  `buildCacheContext`; it is empty outside a request, so a job passes what it needs as an argument.
- **Typing**: the defaults are `unknown[]` / `unknown` — annotate the tuple
  (`@Cacheable<[string]>`, `@CacheTag<[string]>`) or the callback bodies will not compile.
- **Field level is different**: there `args` is the resolver's named-argument object and `ctx` is the
  GraphQL context (`driver-mercurius-cache`).

Full contract, the key bundle `{ a, k, u }`, and the serialization edge cases:
`policy-key-derivation`. Runtime implementation: `setup-decorator-runtime`.

## Rule Categories by Priority

<!-- GENERATED:START:sections -->
| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | One-Time Setup | CRITICAL | `setup-` |
| 2 | Cache Policy | CRITICAL | `policy-` |
| 3 | Leak Safety | CRITICAL | `safety-` |
| 4 | Invalidation | HIGH | `invalidation-` |
| 5 | Observability | MEDIUM | `observability-` |
| 6 | Drivers | MEDIUM | `driver-` |
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
### 1. One-Time Setup (CRITICAL)

- `setup-decorator-runtime` - Implement the Decorators as Method Wrappers with Stable Names
- `setup-disable-switch` - Ship One Config Switch That Bypasses the Service-Level Cache
- `setup-engine-choice` - Use a Deduplicating Engine, and Count TTL in Seconds
- `setup-fail-open` - Fail Open, and Never Cache Errors
- `setup-file-placement` - Place the Capability by Who Imports It
- `setup-identity-context` - Read the Caller from AsyncLocalStorage, Not Scope.REQUEST
- `setup-module-wiring` - Wire the Cache Module Once with forRootAsync
- `setup-storage-and-invalidation` - Enable Invalidation and Set referencesTTL and GC

### 2. Cache Policy (CRITICAL)

- `policy-five-knobs` - Know the Five Knobs
- `policy-key-derivation` - Derive the Key Automatically, Never with JSON.stringify
- `policy-mount-at-service` - Mount at the Service Level by Default
- `policy-one-writing-pattern` - The Decorators Are the One Writing Pattern
- `policy-service-escape-hatch` - The Service API Is an Escape Hatch, Not a Second Pattern

### 3. Leak Safety (CRITICAL)

- `safety-default-public` - Scope Defaults to Public — Mark Caller-Varying Reads perUser
- `safety-key-dimensions` - Scope Covers the User Only — Every Other Dimension Goes in the Key
- `safety-no-leak-checklist` - Run the No-Leak Checklist on Every Cached Read

### 4. Invalidation (HIGH)

- `invalidation-after-success` - Invalidate Only After a Successful Write
- `invalidation-atomic-purge` - Purge Atomically and Cap Tag Cardinality
- `invalidation-generation-prefix` - Use a Generation Prefix for Huge or Coarse Domains
- `invalidation-tags-purge-only` - Tags Are Purge-Only, Never for Lookup

### 5. Observability (MEDIUM)

- `observability-limits-of-events` - Know What the Engine Cannot Report
- `observability-metrics-and-tests` - Track the Metrics That Prove the Fix, and Test on Outcomes
- `observability-per-request-trace` - Surface a Per-Request Trace, Dev-Only on GraphQL
- `observability-structured-events` - Emit Structured Cache Events, Not Log Strings

### 6. Drivers (MEDIUM)

- `driver-apollo-response-cache` - Option C — Apollo responseCachePlugin (Operation Level, TTL Only)
- `driver-apollo-vs-mercurius` - Pick the Field-Level Option from Your Driver
- `driver-async-cache-dedupe` - Option A — async-cache-dedupe (Service Level, Transport-Agnostic)
- `driver-cdn-transport` - Option E — Transport / CDN SWR (Public Reads Only)
- `driver-envelop-response-cache` - Option D — Envelop useResponseCache (Not Native to NestJS)
- `driver-federation-router` - Federation Only — Apollo Router Response Caching
- `driver-mercurius-cache` - Option B — mercurius-cache (Field Level, Real SWR)
- `driver-version-pinning` - Pin Versions — This Area Drifts
<!-- GENERATED:END:rules -->

## How to Use

Start with the One-Time Setup section, then read the policy, safety, and invalidation rules
for the decision in front of you. Rule files live under `rules/`:

```
rules/setup-module-wiring.md
rules/_sections.md
```

Each rule file contains:

- What the rule is and the failure it prevents
- An incorrect example with an explanation
- A correct example with an explanation
- References

## Full Compiled Document

For the complete guide with all rules expanded in a single document, see
[AGENTS.md](./AGENTS.md).
