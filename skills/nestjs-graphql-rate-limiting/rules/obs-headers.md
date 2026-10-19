---
title: Publish RateLimit and Retry-After Headers
impact: MEDIUM
impactDescription: clients can only back off if you tell them how much is left
tags: headers, rate-limit, retry-after, throttler
---

## Publish RateLimit and Retry-After Headers

**Impact: MEDIUM (clients can only back off if you tell them how much is left)**

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
