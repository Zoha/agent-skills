---
title: Ship One Switch That Disables Limiting
impact: MEDIUM-HIGH
impactDescription: an off switch for dev, CI and incidents that does not edit the code
tags: config, kill-switch, devops, decorators
---

## Ship One Switch That Disables Limiting

**Impact: MEDIUM-HIGH (an off switch for dev, CI and incidents that does not edit the code)**

You will need to turn the **counters** off without deleting annotations: local development (a warm
bucket hides the bug you are hunting), CI (exercise the unlimited path), and an incident (the limiter
itself is rejecting legitimate traffic and you need out now). One config flag — `rateLimit.enabled`
(env `RATE_LIMIT_ENABLED`, default `true`) — covers all three. Implement it in the guard (or via the
`skipIf` option), not by removing decorators.

Disable the **throttler layer only.** Depth and cost limits (`depth-*`) are cheap, deterministic and
protect the process itself; leave them on so an incident fix does not also reopen a denial-of-service
hole.

**Incorrect (the switch is code edits, or it disables every layer):**

```typescript
// "off" means commenting out decorators or the guard
// @RateLimit({ window: 'long' })
login() {}
```

```typescript
// and turning everything off also removes the depth cap
const rateLimitDisabled = process.env.RATE_LIMIT_ENABLED === 'false';
// -> depthLimit(...) and the complexity rule are skipped too
```

Why it is wrong: disabling by editing code is not a runtime decision and leaves a diff to remember to
revert; disabling the depth/cost layer removes the protection that does not depend on a shared store.

**Correct (one flag, resolved at boot, throttler layer only):**

```typescript
// config/rate-limit.config.ts
export default registerAs('rateLimit', () => ({
  enabled: process.env.RATE_LIMIT_ENABLED !== 'false', // default ON
  short: Number(process.env.RATE_LIMIT_SHORT ?? 20),
  medium: Number(process.env.RATE_LIMIT_MEDIUM ?? 100),
  long: Number(process.env.RATE_LIMIT_LONG ?? 600),
  redisUrl: process.env.RATE_LIMIT_REDIS_URL,
}));
```

```typescript
// infra/rate-limit/rate-limit.module.ts
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    throttlers: [
      { name: 'short',  ttl: seconds(1),  limit: config.get('rateLimit.short') },
      { name: 'medium', ttl: seconds(10), limit: config.get('rateLimit.medium') },
      { name: 'long',   ttl: minutes(1),  limit: config.get('rateLimit.long') },
    ],
    // one place the flag is read; the guard short-circuits for every request when false
    skipIf: () => !config.get<boolean>('rateLimit.enabled'),
  }),
});
```

Why it is right: turning limiting off is a deployment decision, the depth/cost layer survives, and the
enabled path is the same code you tested — nothing is deleted.

Rules of thumb:

- **Default on, but refuse off in production.** Assert `enabled === true` when `NODE_ENV ===
  'production'` (a validation-schema rule) so a stray env var cannot quietly disable a production
  limiter.
- **`NODE_ENV === 'test'`** may default it off so unit tests exercise the unlimited path — make that a
  visible line, not magic.
- **Emit a boot-time warning** when disabled, so a disabled limiter is never mistaken for a cold one.
- Per-route exemptions are a different tool: `@SkipRateLimit()` (`decorator-explicit-skips`).

Reference: [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting) | [NestJS Configuration](https://docs.nestjs.com/techniques/configuration)
