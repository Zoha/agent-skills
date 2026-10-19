---
title: Count Rejections and Surface a Per-Request Trace
impact: MEDIUM
impactDescription: you cannot tune limits you are not measuring
tags: metrics, observability, trace, cls
---

## Count Rejections and Surface a Per-Request Trace

**Impact: MEDIUM (you cannot tune limits you are not measuring)**

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
