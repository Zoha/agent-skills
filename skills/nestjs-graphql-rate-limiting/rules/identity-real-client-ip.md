---
title: Resolve the Real Client IP Behind a Proxy
impact: CRITICAL
impactDescription: behind Cloudflare req.ip is the edge, so everyone shares one bucket
tags: cloudflare, proxy, trust-proxy, x-forwarded-for, ip
---

## Resolve the Real Client IP Behind a Proxy

**Impact: CRITICAL (behind Cloudflare req.ip is the edge, so everyone shares one bucket)**

Behind Cloudflare, a load balancer or nginx, the socket IP (`req.ip`) is the **proxy**, not the
visitor. Every request then resolves to the same tracker, so the first offender exhausts the bucket for
everyone — and legitimate users are the ones blocked. Two things must both be right:

1. **Tell the framework to trust the proxy**, so `req.ip` / `req.ips` are derived from
   `X-Forwarded-For` correctly.
2. **Trust the forwarding header only if the origin is reachable only through that proxy** — otherwise
   an attacker hits the origin directly and forges the header (`edge-cloudflare-headers`).

**Incorrect (the socket IP, or the raw whole `X-Forwarded-For`):**

```typescript
protected async getTracker(req: Request): Promise<string> {
  return req.ip;                                    // Cloudflare -> the edge IP, shared by everyone
}

// or
protected async getTracker(req: Request): Promise<string> {
  return req.headers['x-forwarded-for'] as string;  // "client, proxy1, proxy2, edge" -> a whole string
}
```

Why it is wrong: `req.ip` is the edge, and the raw forwarding header is a **list**, so using it whole
keys on the entire proxy chain — different visitors share a bucket and no single one is identified.

**Correct (trust the proxy, then resolve the client deliberately):**

```typescript
// main.ts — Express: trust exactly your own proxies, not everything
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // `1` = one proxy hop; or pass your trusted CIDR list. `true` trusts ANY client to set XFF.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  await app.listen(3000);
}
```

```typescript
// common/utils/client-ip.ts — one resolver, used by the tracker
export function resolveClientIp(req: Request): string {
  // With `trust proxy` set, Express already resolved req.ips (left->right = client->nearest proxy).
  // Prefer the left-most XFF entry only because the proxy is trusted; otherwise use req.ip.
  const first = req.ips?.[0];
  return (first ?? req.ip ?? '').trim();
}
```

```typescript
// behind Cloudflare specifically, CF-Connecting-IP is a single, consistent IP
const cfIp = req.headers['cf-connecting-ip'] as string | undefined;
const ip = cfIp ?? resolveClientIp(req);   // only trustworthy if the origin is closed (see edge-cloudflare-headers)
```

Why it is right: `req.ip` now reflects the visitor, the multi-value header is handled as the list it is,
and the Cloudflare-specific header is used only when the trust boundary makes it safe.

Rules of thumb:

- **`trust proxy: true` is a security hole.** It trusts the client to set `X-Forwarded-For`; use the
  hop count or the trusted CIDR list that matches your actual topology (see `expressjs` behind proxies).
- **Fastify is different.** Set the `trustProxy` option on the adapter rather than an Express setting —
  see `driver-alignment`.
- **`X-Forwarded-For` is a list; `CF-Connecting-IP` is one IP.** The Cloudflare header is easier to use
  correctly ("a consistent format containing only one IP") but only safe behind a closed origin.
- **Verify the resolution in a test** (`test-storage-and-time`): two requests with different
  `CF-Connecting-IP` values must land in different buckets, or the whole identity layer is a no-op.

Reference: [Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html) | [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
