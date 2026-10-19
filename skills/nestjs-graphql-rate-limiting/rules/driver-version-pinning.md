---
title: Pin the Stack; Validate Options Against Installed Types
impact: MEDIUM
impactDescription: a renamed option is a silent no-op, not an error
tags: versions, pinning, throttler, drivers
---

## Pin the Stack; Validate Options Against Installed Types

**Impact: MEDIUM (a renamed option is a silent no-op, not an error)**

Every package in this skill has moved recently, and the failure mode of an outdated option name is **not**
a crash — the option is accepted and ignored, so you believe you configured a limit that does not exist.
Pin the stack, and before relying on any option here, open the installed package's type definitions (or
its README at your pinned version) and confirm the option still exists and means what you expect.

Known drift to check:

- **`@nestjs/throttler` v5 vs v6.** v5 removed the per-limit `getLimit()` override (the v4 API) in favour
  of named throttlers plus `@Throttle`. `ttl` is **milliseconds**; use the `seconds()`/`minutes()`
  helpers. Newer options (`skipIf`, `setHeaders`, `errorMessage`, per-set `getTracker`/`generateKey`)
  must be confirmed against your version. `forRoot()` with no throttlers registers **none** and warns at
  boot — treat that warning as an error (`decorator-typed-options`).
- **`@nest-lab/throttler-storage-redis`** peer-depends on `@nestjs/throttler >= 6`; on v5 either upgrade
  or implement `ThrottlerStorage` yourself (`setup-storage`).
- **`graphql-query-complexity`** has moved through forks (including an ESM fork); the exported estimator
  names (`directiveEstimator`, `fieldExtensionsEstimator`, `simpleEstimator`) and the rule factory name
  are **not** guaranteed identical across versions — confirm which exist before quoting one
  (`field-cost-weights`).
- **`graphql-depth-limit` vs `graphile/depth-limit`** are different packages with different options; the
  first has no self-referential notion, the second does (`depth-self-referential`).
- **Apollo Server 4 vs 5.** v5 requires directives to be declared explicitly; `validationRules` handling
  and plugin APIs differ from v2/v3, where `buildSchema({ validationRules })` was removed
  (`driver-apollo-validation`). `@nestjs/apollo` v14 targets AS5.
- **Express v5 is the default in Nest 11**; `trust proxy` semantics and behind-proxy handling are worth
  re-checking when you upgrade (`identity-real-client-ip`).

**Incorrect (relying on remembered names):**

```typescript
// copied from an older release: the option no longer exists / was renamed
ThrottlerModule.forRoot([{ ttl: 60, limit: 5 }]);   // 60 what? and no named throttler
// a guard that overrides `getLimit()` -> method removed in v5; override does nothing
```

Why it is wrong: the limit is not what the code says — a dropped `getLimit()` override means the
configured limit silently applies, and a `ttl: 60` is 60 ms, so the window is a fraction of a second.

**Correct (pin, then verify against the installed definitions):**

```jsonc
// package.json — pin the rate-limiting stack tightly
{
  "@nestjs/throttler": "6.x",
  "@nest-lab/throttler-storage-redis": "1.x",
  "graphql-depth-limit": "1.x",
  "graphql-query-complexity": "1.x",
  "@nestjs/apollo": "14.x",
  "@apollo/server": "5.x"
}
```

```bash
# the verification step before adopting an option from this skill
grep -R "skipIf\|setHeaders\|generateKey" node_modules/@nestjs/throttler/dist --include=*.d.ts
```

Why it is right: a pinned stack makes this skill's guidance reproducible, and a mismatch is caught at
install/typecheck rather than in production where a limit quietly does not apply.

Rules of thumb:

- **Types are the contract.** If the option is not in the installed `.d.ts`, the code will not
  type-check — and if it type-checks but the value is ignored, you have found a version drift to pin
  against.
- **Read the changelog for the two packages that gate everything else**: `@nestjs/throttler` (the guard
  and options) and `@nestjs/apollo` (where the rules are wired).
- **Re-verify after an upgrade** with the e2e test (`test-e2e-limits`) — a passing upgrade that silently
  stops limiting is the exact failure this rule exists to prevent.

Reference: [@nestjs/throttler releases](https://github.com/nestjs/throttler/releases) | [Apollo Server v4 migration](https://www.apollographql.com/docs/apollo-server/migration/)
