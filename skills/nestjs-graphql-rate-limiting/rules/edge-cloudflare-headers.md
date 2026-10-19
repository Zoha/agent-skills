---
title: Trust CF-Connecting-IP Only When the Origin Is Closed
impact: CRITICAL
impactDescription: a spoofable client-IP header is an identity bypass
tags: cloudflare, cf-connecting-ip, origin, mTLS, tunnel
---

## Trust CF-Connecting-IP Only When the Origin Is Closed

**Impact: CRITICAL (a spoofable client-IP header is an identity bypass)**

Cloudflare sends `CF-Connecting-IP` on edge→origin traffic, and it carries the client IP connecting to
Cloudflare rather than the `X-Forwarded-For` list, so it is far easier to key on
(`identity-real-client-ip`). But the header is only meaningful if **the origin can be reached only
through Cloudflare.** Anyone who can hit your origin address directly can send `CF-Connecting-IP: <any
value>` and pick their own bucket, or share a victim's. So trust the header only behind a closed origin.

**Incorrect (trust the header with the origin wide open):**

```typescript
// origin is bound to 0.0.0.0:443 and its IP is discoverable
const ip = (req.headers['cf-connecting-ip'] as string) ?? req.ip;   // attacker forges the header
```

Why it is wrong: the trust boundary the header implies does not exist, so every identity decision built
on it (anonymous buckets, per-IP edge-of-limit rules) is attacker-controlled.

**Correct (close the origin first, then trust the header):**

```text
Close the origin to everything except Cloudflare, in order of strength:
  1. Cloudflare Tunnel            -> the origin has no public address at all
  2. Authenticated Origin Pulls   -> mTLS with a Cloudflare origin-pull cert; only your zone connects
  3. Firewall the origin to Cloudflare IP ranges  -> helps, but weak on its own: those ranges are
     shared by every Cloudflare customer, so another customer can still reach you and forge the header
Prefer 1 or 2; an IP allow-list is a partial measure, not the guarantee.
```

```typescript
// only now is the header trustworthy; still fall back if it is absent
const ip = (req.headers['cf-connecting-ip'] as string) ?? resolveClientIp(req);
```

Why it is right: with the origin closed, the only traffic that carries `CF-Connecting-IP` came through
your zone, so the header is a real identity; the fallback keeps non-Cloudflare deployments working.

Rules of thumb:

- **Pick one source of client IP and state it.** Either `CF-Connecting-IP` (origin closed) or
  `X-Forwarded-For` with `trust proxy` (`identity-real-client-ip`) — not both, and never the raw socket
  IP behind a CDN.
- **`True-Client-IP` is Enterprise and must be explicitly enabled** on the Cloudflare side; it is not a
  drop-in for `CF-Connecting-IP`.
- **Subrequests can carry a dummy value.** Cloudflare notes that some Worker subrequests set
  `CF-Connecting-IP` to a placeholder for security, so do not treat it as meaningful on traffic that
  did not originate at the edge.
- **Test the boundary.** A request straight to the origin that still gets a per-forged-IP bucket is the
  signal the origin is not closed.

Reference: [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/) | [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
