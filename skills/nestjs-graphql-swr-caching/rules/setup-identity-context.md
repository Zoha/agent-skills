---
title: Read the Caller from AsyncLocalStorage, Not Scope.REQUEST
impact: CRITICAL
impactDescription: per-user keying without bubbling request scope through the graph
tags: nestjs-cls, AsyncLocalStorage, per-user, scope, identity
---

## Read the Caller from AsyncLocalStorage, Not Scope.REQUEST

**Impact: CRITICAL (per-user keying without bubbling request scope through the graph)**

Service methods rarely take a user argument, and `Scope.REQUEST` bubbles through the whole provider
graph (and breaks the singleton cache client). Populate caller identity once per request with
`nestjs-cls` (AsyncLocalStorage), then read it where the key is built.

- Providers read it via injected `ClsService`.
- **Decorators cannot inject** — read it via `ClsServiceManager.getClsService()`.
- **Background jobs/subscriptions have no request**: pass the id explicitly as a key dimension.
- Identity comes from **verified auth**, never a raw client header.

**Incorrect (request-scoped cache service + unverified header):**

```typescript
@Injectable({ scope: Scope.REQUEST }) // bubbles everywhere; singleton cache client breaks
export class CacheService {
  private user = this.req.headers['x-user-id']; // client-controlled -> identity spoofing
}
```

Why it is wrong: request scope defeats the shared client and single-flight map, and the header is
untrusted, so anyone can read another user's cached entry.

**Correct (CLS populated once from the authenticated user):**

```typescript
// app.module.ts
ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    setup: (cls, req) => {
      cls.set('userId', req.user?.id ?? null);       // req.user comes from the verified JWT
      cls.set('tenantId', req.user?.tenantId ?? null);
      cls.set('locale', req.user?.locale ?? null);
    },
  },
});

// a provider
const userId = this.cls.get<string>('userId');

// inside a decorator wrapper (no DI available)
import { ClsServiceManager } from 'nestjs-cls';
const userId = ClsServiceManager.getClsService().get<string>('userId');

// a BullMQ processor — no request, so the caller passes the id explicitly
@Cacheable({ ttl: 60, swr: 300, key: (a) => ['invoices', a.userId] })
rebuildInvoicesFor(userId: string) {}
```

Why it is right: the cache client stays a singleton, identity is set once from verified auth, and the
one context that has no request passes the id as an explicit key dimension.

Reference: [NestJS Async Local Storage](https://docs.nestjs.com/recipes/async-local-storage) | [nestjs-cls](https://github.com/Papooch/nestjs-cls)
