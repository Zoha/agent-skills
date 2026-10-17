---
title: Surface a Per-Request Trace, Dev-Only on GraphQL
impact: MEDIUM
impactDescription: one request shows exactly what was cached and why
tags: trace, cls, X-Cache, Age, extensions
---

## Surface a Per-Request Trace, Dev-Only on GraphQL

**Impact: MEDIUM (one request shows exactly what was cached and why)**

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
