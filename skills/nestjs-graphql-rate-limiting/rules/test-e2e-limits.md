---
title: Prove the Limit End-to-End Against the Real Endpoint
impact: MEDIUM
impactDescription: a correct rule wired in the wrong place still does nothing
tags: testing, e2e, supertest, graphql
---

## Prove the Limit End-to-End Against the Real Endpoint

**Impact: MEDIUM (a correct rule wired in the wrong place still does nothing)**

Unit tests prove the rule and the guard; only an e2e test proves the **wiring** — that the guard is bound
globally, the validation rules are registered with the driver, and the rejection comes back to the client
as a `RATE_LIMITED` error with headers. A document sent to a real Nest app booted from `AppModule` and
POSTed to the GraphQL endpoint is the end of the argument. Use the repository's shared helpers rather than
a one-off setup (`test-e2e-supertest` and `conventions-test-fixtures` in the sibling skills).

**Incorrect (an e2e that boots a partial app, or asserts on the wrong layer):**

```typescript
const res = await request(app.getHttpServer()).post('/graphql').send({ query: '{ me { id } }' });
expect(res.status).toBe(429);      // Apollo returns HTTP 200 for execution errors; error is in the body
```

Why it is wrong: it asserts an HTTP status GraphQL does not use for an execution error, and if it boots a
test module that only registers the rule (not the guard), it proves the rule in isolation again.

**Correct (boot the real AppModule, drive the real endpoint, assert the contract):**

```typescript
// test/rate-limit.e2e-spec.ts
import { gql } from './helpers/graphql';    // the shared POST helper (`conventions-test-fixtures`)

describe('rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RATE_LIMIT_STORAGE)          // your throttler storage token (see `setup-storage`)
      .useValue(new InMemoryThrottlerStorage())
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('rejects the request past the window with a RATE_LIMITED error', async () => {
    const attempts = Array.from({ length: 6 }, () => gql(app, `mutation { login(input: $in) { accessToken } }`, { in: BAD_LOGIN }));
    const results = await Promise.all(attempts);   // or sequential, for a stable boundary
    const rejected = results.at(-1)!;
    expect(rejected.body.errors?.[0].extensions.code).toBe('RATE_LIMITED');
    expect(rejected.body.errors?.[0].extensions.retryAfterMs).toBeGreaterThan(0);
    expect(rejected.headers['retry-after']).toBeDefined();
  });

  it('rejects a document past the depth cap with a validation error', async () => {
    const res = await gql(app, deepQuery);
    expect(res.body.errors?.[0].extensions.code).toBe('QUERY_TOO_DEEP');
    expect(res.body.errors?.[0].extensions.code).not.toBe('RATE_LIMITED');   // not a rate limit
  });
});
```

Why it is right: it exercises the whole chain — global guard binding, GraphQL context, driver-registered
validation rules, error shape and headers — which is exactly the class of bug the unit tests cannot see.

Rules of thumb:

- **Override only the storage** for determinism; keep the real guard, the real module wiring and the real
  validation rules under test (`test-mock-external-services`).
- **Sequential requests for a stable boundary**, concurrency only when you are testing the race
  (`op-cost-based-limits` cost accounting under load).
- **Assert the transport contract explicitly**: `extensions.code`, `retryAfterMs`, the `Retry-After`
  header (`obs-error-shape`, `obs-headers`).
- **Distinguish the rejections** — a rate limit and a depth rejection must carry different codes, or the
  e2e test hides a rule that is rejecting valid traffic.
- **Keep the e2e in `test/`**, unit tests co-located with their subject (`conventions-testing`).

Reference: [NestJS e2e testing](https://docs.nestjs.com/fundamentals/testing#end-to-end-testing) | [GraphQL over HTTP](https://graphql.org/learn/serving-over-http/)
