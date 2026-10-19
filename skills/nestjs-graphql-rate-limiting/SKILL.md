---
name: nestjs-graphql-rate-limiting
description: Use when adding or hardening rate limiting in a NestJS GraphQL (code-first) app — when a client can brute-force a mutation, spam an expensive query, nest a query to a denial-of-service depth, or when a limit behaves oddly behind Cloudflare or across replicas. Triggers on @nestjs/throttler wiring, per-operation vs per-HTTP-request limits, query depth and complexity limits, per-field cost or field-level budgets, @RateLimit/@SkipRateLimit decorators, per-user/per-IP/API-key trackers, real client IP behind a proxy, Cloudflare rate-limiting rules or Workers Rate Limiting, distributed counter storage, 429/Retry-After/RateLimit headers in GraphQL, and testing limits deterministically.
license: MIT
metadata:
  author: Zoha
  version: "1.0.0"
---

# GraphQL Rate Limiting (NestJS, code-first)

## Overview

Limit the **work**, not the socket. GraphQL gives a client one HTTP endpoint and a language for
arbitrary nested queries, so a limiter that counts HTTP requests is measuring the wrong thing: one
`POST /graphql` can carry several operations, repeated aliases, and a query nested deeply enough to
exhaust the process. Demand control is therefore **layered**, and each layer answers a different
question:

| Layer | Question it answers | Mechanism |
|---|---|---|
| **Depth / cost** | "Is this document even allowed to run?" | depth-limit + query-complexity validation rules |
| **Operation limit** | "How much work may this caller spend per window?" | `@nestjs/throttler` keyed per operation, priced by cost |
| **Field limit** | "Is this one expensive field being abused?" | per-field cost weights, list multipliers, hot-field budgets |
| **Edge** | "Should this request even reach the origin?" | Cloudflare rate-limiting rules / Workers Rate Limiting |

Three hard truths that shape every decision:

1. **A POST is not a request.** Three operations in one document, or one operation repeated under
   N aliases, is one HTTP request and N units of work. Count operations, and price by cost.
2. **`ThrottlerGuard` does not work on resolvers unchanged.** It reads `request`/`response` off the
   HTTP context; on a resolver it must be taught to read them from `GqlExecutionContext` (see
   `setup-graphql-guard`).
3. **`req.ip` is wrong behind a CDN.** With Cloudflare (or any proxy) in front, the socket IP is the
   edge, so every visitor shares one bucket. The tracker must resolve the real client, and the header
   it trusts must be trustworthy (see `identity-real-client-ip`, `edge-cloudflare-headers`).

## When to Use

- Adding rate limiting to a NestJS GraphQL API for the first time (start at Section 1).
- A sensitive mutation (login, register, password reset, payment) can be brute-forced or spammed.
- A single expensive field or a deeply nested query is a denial-of-service vector.
- Limits "work locally but not in production" — usually replicas, a proxy, or an in-memory store.
- You need GraphQL-shaped errors and headers so clients can back off correctly.

**When NOT to use:**

- You only need to blunt a bot flood on a static HTTP surface — start with Cloudflare rate-limiting
  rules at the edge and do nothing at the origin.
- The app is a single instance with no proxy and no expensive fields; a plain HTTP throttle is enough.

## The Decorator Surface

One declarative surface for policy — a thin layer over the throttler and the cost model, so intent is
greppable in review (see `decorator-one-writing-pattern`).

```typescript
@RateLimit({ window: 'medium', cost: 5 })   // charge this window; optionally raise the price
@SkipRateLimit()                            // explicit, reviewable exemption
@RateLimitCost(20)                          // per-field cost, read by the complexity estimator
```

## Rule Categories by Priority

<!-- GENERATED:START:sections -->
| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | One-Time Setup | CRITICAL | `setup-` |
| 2 | Operation Limits | CRITICAL | `op-` |
| 3 | Depth & Cost Limits | CRITICAL | `depth-` |
| 4 | Field Limits | HIGH | `field-` |
| 5 | Declarative Control | HIGH | `decorator-` |
| 6 | Client Identity | HIGH | `identity-` |
| 7 | Edge & Cloudflare | MEDIUM-HIGH | `edge-` |
| 8 | Errors & Observability | MEDIUM | `obs-` |
| 9 | Testing | MEDIUM | `test-` |
| 10 | Drivers & Versions | MEDIUM | `driver-` |
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
### 1. One-Time Setup (CRITICAL)

- `setup-fail-open` - Fail Open When the Counter Store Is Down
- `setup-file-placement` - Place the Capability by Who Imports It
- `setup-graphql-guard` - Make the Guard Read the GraphQL Context
- `setup-kill-switch` - Ship One Switch That Disables Limiting
- `setup-module-wiring` - Wire the Throttler Once, with Named Windows
- `setup-storage` - Use a Shared Store, Never the Default Memory Store in a Fleet

### 2. Operation Limits (CRITICAL)

- `op-cost-based-limits` - Price by Cost, Not by Call Count Alone
- `op-count-operations` - Count Once per Operation, Not Once per Field
- `op-limit-layers` - Layer the Limits, and Never Charge Twice

### 3. Depth & Cost Limits (CRITICAL)

- `depth-breadth-aliases` - Cap Breadth: Aliases, Root Fields, Selections
- `depth-introspection-apq` - Gate Introspection and Require Persisted Queries
- `depth-self-referential` - Cap Self-Referential Depth
- `depth-validation-rule` - Enforce Depth as a Validation Rule, Before Execution

### 4. Field Limits (HIGH)

- `field-cost-weights` - Give Expensive Fields an Explicit Cost
- `field-hot-field-budget` - Give a Hot Field Its Own Budget
- `field-list-multipliers` - Multiply List Cost by the Requested Page Size

### 5. Declarative Control (HIGH)

- `decorator-explicit-skips` - Make Every Skip Explicit and Greppable
- `decorator-one-writing-pattern` - One Declarative Surface for Policy
- `decorator-typed-options` - Type the Options; Never Inline Magic Numbers

### 6. Client Identity (HIGH)

- `identity-anonymous-fallback` - Give Anonymous Callers a Coarse, Documented Bucket
- `identity-real-client-ip` - Resolve the Real Client IP Behind a Proxy
- `identity-tracker-hierarchy` - Track Verified User, Then API Key, Then Tenant, Then IP

### 7. Edge & Cloudflare (MEDIUM-HIGH)

- `edge-cloudflare-enforcement` - Enforce Cheap Limits at the Edge
- `edge-cloudflare-headers` - Trust CF-Connecting-IP Only When the Origin Is Closed
- `edge-defense-in-depth` - Layer the Edge and the Origin
- `edge-durable-objects-vs-kv` - Use Durable Objects, Not KV, for Exact Counters

### 8. Errors & Observability (MEDIUM)

- `obs-error-shape` - Return a GraphQL Error with Extensions, Not a Bare 429
- `obs-headers` - Publish RateLimit and Retry-After Headers
- `obs-metrics-and-trace` - Count Rejections and Surface a Per-Request Trace

### 9. Testing (MEDIUM)

- `test-depth-and-cost-rules` - Test the Rules on Documents, Table-Driven
- `test-e2e-limits` - Prove the Limit End-to-End Against the Real Endpoint
- `test-storage-and-time` - Test with an In-Memory Store and Frozen Time

### 10. Drivers & Versions (MEDIUM)

- `driver-alignment` - Match the Guard to the Driver's Context Shape
- `driver-apollo-validation` - Register Validation Rules Where the Driver Reads Them
- `driver-version-pinning` - Pin the Stack; Validate Options Against Installed Types
<!-- GENERATED:END:rules -->

## How to Use

Start with One-Time Setup, then read the section for the decision in front of you: an expensive query
is Section 3, a sensitive mutation is Section 2 plus Section 5, and "the limit misbehaves in
production" is Section 6 or Section 7. Rule files live under `rules/`:

```
rules/setup-module-wiring.md
rules/_sections.md
```

Each rule file contains:

- What the rule is and the failure it prevents
- An incorrect example with an explanation
- A correct example with an explanation
- References

## Relationship to the Other NestJS Skills

This skill is demand control only. It defers to its siblings for everything around it:

- **`nestjs-best-practices`** — `security-rate-limiting` is the shallow introduction this skill
  deepens; `security-use-guards` owns guard mechanics; `devops-use-config-module` owns the typed
  config this skill reads; `test-mock-external-services` owns the mocking discipline.
- **`nestjs-graphql-structure`** — `infra-common` and `struct-canonical-layout` decide **where** the
  module, guard and decorators live; `module-feature-module` decides what a feature declares.
- **`nestjs-graphql-swr-caching`** — a cache is not a limiter; its `observability-metrics-and-tests`
  and key-derivation rules are the pattern this skill's observability and identity sections mirror.

## Full Compiled Document

For the complete guide with all rules expanded in a single document, see
[AGENTS.md](./AGENTS.md).
