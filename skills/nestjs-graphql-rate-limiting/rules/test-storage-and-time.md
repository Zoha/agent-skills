---
title: Test with an In-Memory Store and Frozen Time
impact: MEDIUM
impactDescription: deterministic limit tests without Redis or sleeping
tags: testing, fake-timers, in-memory, determinism
---

## Test with an In-Memory Store and Frozen Time

**Impact: MEDIUM (deterministic limit tests without Redis or sleeping)**

A rate-limit test with a real Redis and real wall-clock time is slow, flaky and order-dependent. Test the
**behaviour** with the throttler's in-memory storage and **fake timers**: assert that the Nth call is
allowed, the (N+1)th is rejected, and that after advancing the clock the caller is allowed again. Never
assert on a Redis key's existence or name — that is implementation-bound and proves nothing about the
limit (`observability-metrics-and-tests` in the `nestjs-graphql-swr-caching` skill makes the same point
for the cache).

**Incorrect (a real store, real time, and assertions on internals):**

```typescript
it('blocks after 5', async () => {
  for (let i = 0; i < 5; i++) await login();
  await expect(login()).rejects.toThrow();
  expect(await redis.exists('rl:default:1.2.3.4')).toBe(1);   // brittle, driver-bound
  // also relies on being the only test using that IP -> order-dependent
});
```

Why it is wrong: it needs a live Redis, leaks between tests through shared keys, asserts on the counter's
storage shape rather than the limit, and cannot test the window without real sleeping.

**Correct (in-memory store, frozen time, isolated trackers):**

```typescript
// test/helpers/rate-limit.ts — one module factory for every test
export async function createRateLimitTestingModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([
        { name: 'long', ttl: 60_000, limit: 5 },   // in-memory storage by default
      ]),
    ],
    providers: [
      { provide: APP_GUARD, useClass: GqlThrottlerGuard },
      { provide: ConfigService, useValue: { get: (k: string) => ({ 'rateLimit.enabled': true })[k] } },
    ],
  }).compile();
}

describe('GqlThrottlerGuard', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('allows the limit, then blocks, then recovers after the window', async () => {
    const guard = makeGuard({ tracker: 'user:42' });

    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(gqlContext())).resolves.toBe(true);
    }
    await expect(guard.canActivate(gqlContext())).rejects.toBeInstanceOf(RateLimitedException);

    jest.advanceTimersByTime(60_001);              // past the window
    await expect(guard.canActivate(gqlContext())).resolves.toBe(true);
  });

  it('keeps separate trackers independent', async () => {
    await exhaust('user:42', 5);
    await expect(canActivate('user:7')).resolves.toBe(true);   // a different user is untouched
  });

  it('resolves two client IPs into two buckets', async () => {
    await exhaustIp('203.0.113.1', 5);
    await expect(canActivateIp('198.51.100.9')).resolves.toBe(true);  // `identity-real-client-ip`
  });
});
```

Why it is right: the test runs in milliseconds with no infrastructure, isolates every tracker, and proves
the three behaviours that matter — the limit fires, the window resets, and identities do not bleed.

Rules of thumb:

- **Assert outcomes, not keys.** "Blocked on the 6th call" is the contract; the storage key is an
  implementation detail.
- **One unique tracker per test** (a fresh `user:<uuid>`) so tests never share a bucket and order does
  not matter.
- **Freeze time; never `sleep`.** `jest.useFakeTimers()` + `advanceTimersByTime` tests the window
  instantly and deterministically.
- **Test the fail-open path too**: point the store at a stub whose `increment` throws and assert the
  request is allowed and the `storage_errors` counter moved (`setup-fail-open`).
- **Mock only at the boundary.** Mock the storage or Redis client, never the guard's own logic
  (`test-mock-external-services` in the `nestjs-best-practices` skill).

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing) | [Jest timer mocks](https://jestjs.io/docs/timer-mocks)
