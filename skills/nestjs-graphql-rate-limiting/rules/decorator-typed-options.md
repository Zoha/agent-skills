---
title: Type the Options; Never Inline Magic Numbers
impact: MEDIUM
impactDescription: a typo in a window name is a silent no-op
tags: decorators, types, config, windows
---

## Type the Options; Never Inline Magic Numbers

**Impact: MEDIUM (a typo in a window name is a silent no-op)**

A named throttler that does not exist is not an error — the guard simply has nothing to check for that
field, which reads as "limited" in review while being open in production. Make the impossible state
unrepresentable: type the window as a closed union of the names you actually configured, and let limits
come from the config table, not from literals.

**Incorrect (free-form strings and inline numbers):**

```typescript
@RateLimit({ window: 'meduim' })          // typo -> no matching throttler -> silently unchecked
@RateLimit({ window: 'long', limit: 600000 })  // a number that duplicates the config table
findAll() {}
```

Why it is wrong: the decorator reads as protection, the guard matches nothing, and the numbers drift
from the configured windows the moment someone changes the table.

**Correct (a closed union, one source of truth for numbers):**

```typescript
// common/decorators/rate-limit.types.ts — the closed set, derived from the config
export const RATE_LIMIT_WINDOWS = ['short', 'medium', 'long', 'search'] as const;
export type RateLimitWindow = (typeof RATE_LIMIT_WINDOWS)[number];

export interface RateLimitOptions {
  window: RateLimitWindow;   // a typo is now a compile error
  limit?: number;            // omit to inherit the configured limit
}

// common/decorators/rate-limit.decorators.ts
export function RateLimit(opts: RateLimitOptions) { /* ... */ }
```

```typescript
// the numbers live once, in config, and the decorator only names the window
@RateLimit({ window: 'long' })    // limit comes from config/rate-limit.config.ts
findAll() {}
```

Why it is right: an unknown window cannot be written, the limit has exactly one home
(`devops-use-config-module`), and a decorator that reads "limited" is actually limited.

Rules of thumb:

- **Keep the union and the config in sync** — ideally derive the union from the same constant array the
  module iterates, so adding a window in one place adds it in both.
- **Assert at boot** that every window name the code references exists in the module configuration.
  Throttler warns at startup when no throttler is registered; turn that warning into a startup failure.
  (See `setup-kill-switch` for the same "fail loud" principle.)
- **Defaults are policy, not magic.** If a field omits `limit`, say in one place which window's limit it
  inherits; do not let "no limit" and "the long window" look identical in review.

Reference: [NestJS Custom decorators](https://docs.nestjs.com/custom-decorators) | [NestJS Rate limiting](https://docs.nestjs.com/security/rate-limiting)
