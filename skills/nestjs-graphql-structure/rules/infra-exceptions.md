---
title: Put Exceptions in exceptions/
impact: MEDIUM-HIGH
impactDescription: one home for shared and feature-local error types
tags: exceptions, errors, common
---

## Put Exceptions in exceptions/

**Impact: MEDIUM-HIGH (one home for shared and feature-local error types)**

**Purpose.** Custom exception classes are their own file kind, so they get their own home. A
shared base or application-wide exception lives in `common/exceptions/`; an exception that belongs
to one feature lives in that feature's `exceptions/` folder, next to the module that throws it.
This gives `UserNotFoundException` and its peers one predictable location instead of being
declared inside a service file.

**Placement.**

- Shared/base: `src/common/exceptions/<name>.exception.ts` (e.g. `domain.exception.ts`).
- Feature-local: `modules/<feature>/exceptions/<name>.exception.ts` (e.g.
  `user-not-found.exception.ts`).

**Responsibilities.**

- Give each custom exception its own file and class.
- Keep a feature exception beside the feature that throws it.
- Keep a genuinely shared base or cross-feature exception in `common/exceptions/`.

**Never.**

- Declare exception classes inside a service, resolver, or module file.
- Put a feature-specific exception in `common/` — that couples `common/` to a feature.
- Duplicate the same exception class across features.

**Incorrect (exception declared inline in a service, then duplicated):**

```typescript
// modules/users/services/users.service.ts
class UserNotFoundException extends Error {} // hidden in a service file

// modules/orders/services/orders.service.ts
class UserNotFoundException extends Error {} // a second, drifting copy
```

Why it is wrong: the exception has no home, cannot be reused or filtered centrally, and the copies
drift as each is edited.

**Correct (one file per exception; shared base vs feature-local):**

```typescript
// common/exceptions/domain.exception.ts — the shared base
export class DomainException extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

// modules/users/exceptions/user-not-found.exception.ts — feature-local
export class UserNotFoundException extends DomainException {
  constructor(id: string) {
    super(`User #${id} not found`, 'USER_NOT_FOUND');
  }
}

// modules/users/services/users.service.ts — imports the one definition
import { UserNotFoundException } from '../exceptions/user-not-found.exception';
```

Why it is right: each exception has one file and one home, a feature exception sits with its
feature, and a shared base lives in `common/` so a central filter can map it.

Reference: [NestJS Exception Filters](https://docs.nestjs.com/exception-filters)

**Behavioral depth.** See `nestjs-best-practices` -> `error-throw-domain-errors`, `error-use-exception-filters`.
