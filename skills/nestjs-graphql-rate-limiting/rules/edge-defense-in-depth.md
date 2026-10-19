---
title: Layer the Edge and the Origin
impact: MEDIUM-HIGH
impactDescription: the edge absorbs floods; the origin enforces per-identity work
tags: cloudflare, edge, origin, defense-in-depth
---

## Layer the Edge and the Origin

**Impact: MEDIUM-HIGH (the edge absorbs floods; the origin enforces per-identity work)**

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
