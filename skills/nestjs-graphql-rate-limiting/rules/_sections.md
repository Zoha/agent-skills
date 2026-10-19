# Sections

This file defines all sections, their ordering, impact levels, and descriptions.
The section ID (in parentheses) is the filename prefix used to group rules.

---

## 1. One-Time Setup (setup-)

**Impact:** CRITICAL
**Description:** Wire the capability once: one throttler module, the GraphQL-aware guard, a shared storage, a single kill switch, fail-open behaviour, and the file placement that keeps infrastructure out of features.

## 2. Operation Limits (op-)

**Impact:** CRITICAL
**Description:** What one "request" costs — count per GraphQL operation rather than per HTTP POST, layer edge and origin without double-charging, and price by cost/complexity rather than by call count alone.

## 3. Depth & Cost Limits (depth-)

**Impact:** CRITICAL
**Description:** Reject hostile documents before execution: a depth-limit validation rule, self-referential (cyclic) depth, breadth and alias caps, and introspection/persisted-query policy.

## 4. Field Limits (field-)

**Impact:** HIGH
**Description:** Price individual fields: explicit cost weights on expensive fields, list cost multiplied by the requested page size, and a dedicated budget for a genuinely hot field.

## 5. Declarative Control (decorator-)

**Impact:** HIGH
**Description:** One greppable decorator surface for policy — @RateLimit, @SkipRateLimit, @RateLimitCost — with typed options and explicit, reviewable skips.

## 6. Client Identity (identity-)

**Impact:** HIGH
**Description:** Who the limit is charged to: a verified-user-first tracker, real client IP behind Cloudflare and other proxies, resource-scoped keys, and a documented anonymous fallback.

## 7. Edge & Cloudflare (edge-)

**Impact:** MEDIUM-HIGH
**Description:** Defence in depth across the CDN and the origin: layer the two, trust CF-Connecting-IP only when the origin is closed, use Cloudflare rate-limiting rules and the Workers Rate Limiting binding, and pick Durable Objects over KV for exact counters.

## 8. Errors & Observability (obs-)

**Impact:** MEDIUM
**Description:** A rate limit is an API contract: a GraphQL error with extensions, RateLimit/Retry-After headers the client can act on, and metrics plus a per-request trace.

## 9. Testing (test-)

**Impact:** MEDIUM
**Description:** Prove the limits on outcomes: an in-memory store with frozen time, table-driven depth/complexity documents, and an e2e check against the real endpoint.

## 10. Drivers & Versions (driver-)

**Impact:** MEDIUM
**Description:** The driver reality check — Express versus Fastify/Mercurius context shape, where Apollo v4/v5 registers validation rules, and version pinning for a stack that drifts.
