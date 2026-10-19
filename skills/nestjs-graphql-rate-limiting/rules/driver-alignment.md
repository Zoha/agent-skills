---
title: Match the Guard to the Driver's Context Shape
impact: MEDIUM
impactDescription: a guard written for Express silently breaks on Fastify
tags: drivers, express, fastify, mercurius, context
---

## Match the Guard to the Driver's Context Shape

**Impact: MEDIUM (a guard written for Express silently breaks on Fastify)**

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
