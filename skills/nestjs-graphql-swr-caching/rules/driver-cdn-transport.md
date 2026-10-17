---
title: Option E — Transport / CDN SWR (Public Reads Only)
impact: MEDIUM
impactDescription: removes the edge miss for anonymous traffic
tags: cdn, cache-control, apq, rfc5861
---

## Option E — Transport / CDN SWR (Public Reads Only)

**Impact: MEDIUM (removes the edge miss for anonymous traffic)**

For **public** reads only. Apollo sets `Cache-Control` from cache hints; MDN/RFC 5861
`stale-while-revalidate` lets the CDN serve stale at the edge.

- Enable **APQ** + `useGETForHashedQueries: true` so clients send short hashes via `GET` (CDNs cache
  `GET` only).
- Never combine with `must-revalidate`/`private` — they silently disable stale serving.
- Never use a shared/CDN cache for per-user responses.

**Incorrect (a directive combination that silently disables SWR):**

```typescript
res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
// 'private' -> no shared cache at all; SWR is a no-op at the CDN
```

Why it is wrong: `private` (or `must-revalidate`) prevents the shared cache from serving stale, so the
CDN provides no protection at expiry.

**Correct (public, hashable GETs, no conflicting directives):**

```typescript
res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

// Apollo
new ApolloDriverConfig({ plugins: [ApolloServerPluginCacheControl()] });
persistedQueries: { cache: redisCache },  // APQ
useGETForHashedQueries: true,
```

Why it is right: only public traffic hits the shared edge cache, GET + hash makes it cacheable, and no
conflicting directive disables stale serving.

Reference: [RFC 5861](https://www.rfc-editor.org/rfc/rfc5861) | [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
