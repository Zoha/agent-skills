---
title: Enforce Cheap Limits at the Edge
impact: MEDIUM-HIGH
impactDescription: reject floods without spending origin CPU
tags: cloudflare, workers, rate-limit-binding, edge-rules
---

## Enforce Cheap Limits at the Edge

**Impact: MEDIUM-HIGH (reject floods without spending origin CPU)**

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
