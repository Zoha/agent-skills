---
title: Give Anonymous Callers a Coarse, Documented Bucket
impact: HIGH
impactDescription: an unbounded anonymous path, or one bucket every anon shares
tags: identity, anonymous, ip, nat, fallback
---

## Give Anonymous Callers a Coarse, Documented Bucket

**Impact: HIGH (an unbounded anonymous path, or one bucket every anon shares)**

Login, register, password reset and public queries are exactly the endpoints an attacker abuses, and
they are also the ones with no verified user. Handle the anonymous case deliberately — neither exempt it
(no protection where you need it most) nor key it under an empty identity (everyone collides into one
bucket and one caller blocks all). Use the resolved client IP, and write down the trade-off.

**Incorrect (two ways to get anonymous wrong):**

```typescript
protected async getTracker(req: Request): Promise<string> {
  if (!req.user) return 'anonymous';       // every anonymous caller shares ONE bucket
}

// or
@SkipRateLimit('public endpoints are not limited')
@Mutation(() => Boolean)
forgotPassword() {}
```

Why it is wrong: the shared bucket lets one attacker DoS all anonymous traffic (and is trivially
bypassed when they rotate IPs), and the skip removes protection from the most abusable mutations.

**Correct (a coarse, hashed IP bucket with a documented trade-off):**

```typescript
// common/guards/gql-throttler.guard.ts — the anonymous fallback, explicit
protected async getTracker(req: Request & { user?: AuthenticatedUser }): Promise<string> {
  if (req.user?.id) return `user:${req.user.id}`;      // verified -> per user
  return `ip:${hashIp(resolveClientIp(req))}`;         // anonymous -> per client IP
}
```

```text
Anonymous trade-off (documented in the module, not discovered in production):
  - a shared NAT (office/school/carrier) shares one anonymous bucket;
  - set the anonymous window generously enough for that, and rely on the
    verified per-user window for authenticated fairness;
  - login/register keep a *separate, stricter* window (`field-hot-field-budget`).
```

Why it is right: anonymous traffic is bounded, one abusive IP cannot block every anonymous caller, and
the shared-NAT consequence is a written, reviewable decision rather than a support ticket.

Rules of thumb:

- **Different windows for anonymous vs authenticated.** Anonymous gets the coarse IP bucket *and* the
  strict auth-mutation window (`@RateLimit({ window: 'auth' })` on login/register/reset).
- **Hash the IP.** The bucket key should not be a raw address; an HMAC with a server secret is enough
  (`identity-tracker-hierarchy`).
- **A stricter tracker for credential endpoints.** Consider also keying login by the submitted
  *identifier* (the email/username), so one IP cannot spray many accounts and one account cannot be
  sprayed from many IPs — combine both keys.
- **Never key on an empty value.** `user:<undefined>` or `''` collapses every caller into one bucket; the
  fallback must always produce a non-empty key.

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
