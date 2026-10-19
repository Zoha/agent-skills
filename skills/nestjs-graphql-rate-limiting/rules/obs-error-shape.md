---
title: Return a GraphQL Error with Extensions, Not a Bare 429
impact: MEDIUM
impactDescription: clients read the errors array, so a status code alone is invisible
tags: errors, extensions, graphql, retry-after
---

## Return a GraphQL Error with Extensions, Not a Bare 429

**Impact: MEDIUM (clients read the errors array, so a status code alone is invisible)**

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
