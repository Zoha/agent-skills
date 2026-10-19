---
title: Track Verified User, Then API Key, Then Tenant, Then IP
impact: CRITICAL
impactDescription: tracking by IP behind a NAT punishes whole networks
tags: identity, tracker, user, api-key, tenant
---

## Track Verified User, Then API Key, Then Tenant, Then IP

**Impact: CRITICAL (tracking by IP behind a NAT punishes whole networks)**

The tracker is *who the limit is charged to*. Defaulting to IP is the worst of the options: an office,
a school or a carrier NAT shares one bucket, so one abuser blocks thousands of legitimate users, and a
determined abuser rotates IPs freely. Resolve identity in a documented priority order and **never trust
a client-supplied identifier**.

Priority, most- to least-specific:

1. **Verified user** — `req.user.id`, set by the auth strategy from a validated JWT (`security-auth-jwt`).
2. **API key** — the key's identity after the key has been verified (not the raw header value).
3. **Tenant** — a shared bucket for one organisation (`tenantId`), when per-user is too granular.
4. **IP** — the fallback, resolved correctly (`identity-real-client-ip`).

Prefix the tracker by kind so two kinds never collide (`user:1` and `ip:1` must be different buckets).

**Incorrect (client-controlled identity, or IP-only):**

```typescript
protected async getTracker(req: Request): Promise<string> {
  return req.headers['x-user-id'] as string;   // client can send anything -> ban anyone, or evade
}

// or
protected async getTracker(req: Request): Promise<string> {
  return req.ip;                               // behind Cloudflare/NAT a whole network shares this
}
```

Why it is wrong: the first trusts a spoofable header, so an attacker sets it to a victim's id (or a new
id per request); the second punishes every user behind the same address.

**Correct (a verified-first hierarchy, prefixes, explicit fallback):**

```typescript
// common/guards/gql-throttler.guard.ts
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: AuthenticatedUser }): Promise<string> {
    const user = req.user;                                   // set by the JWT strategy, verified
    if (user?.id) return `user:${user.id}`;

    const apiKey = (req as any).apiKey;                      // set by the API-key guard, verified
    if (apiKey?.id) return `apikey:${apiKey.id}`;

    if (user?.tenantId) return `tenant:${user.tenantId}`;

    return `ip:${hashIp(resolveClientIp(req))}`;             // coarse, hashed, documented fallback
  }
}
```

Why it is right: the limit follows the caller across networks when their identity is known, an anonymous
caller still gets a bucket, and no client-supplied value is trusted without verification.

Rules of thumb:

- **Include the resource in the key, not only the identity.** `ops:${tracker}` and `fields:${tracker}`
  are different counters; a single unqualified key makes a field limit and an operation limit share a
  bucket (`op-limit-layers`).
- **Hash the IP** before it becomes a key (a short HMAC with a server secret) so the identifier used for
  limiting is not a stored plain address — a small privacy win that costs nothing.
- **Verified means verified.** `req.user` comes from the Passport strategy's validated payload; an
  `x-user-id` header, a JWT *claim* you did not verify, or a GraphQL variable are all untrusted.
- **The hierarchy is one function, in the guard** — not a `skipIf` in the module and a second decision in
  a resolver.

Reference: [NestJS Guards](https://docs.nestjs.com/guards) | [security/auth in NestJS](https://docs.nestjs.com/security/authentication)
