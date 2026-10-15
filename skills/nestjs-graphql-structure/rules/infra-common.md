---
title: Put Shared Building Blocks in common/
impact: MEDIUM
impactDescription: reusable, feature-agnostic helpers live here
tags: common, guards, filters, scalars
---

## Put Shared Building Blocks in common/

**Impact: MEDIUM (reusable, feature-agnostic helpers live here)**

**Purpose.** Cross-cutting building blocks that any feature may use — decorators, exception
filters, guards, interceptors, pipes, and custom scalars — live in `common/`. They know nothing
about any feature. Features import them; they never import a feature.

**Placement.** `src/common/{decorators,filters,guards,interceptors,pipes,scalars,utils}/`.

**Responsibilities.**

- Provide feature-agnostic, reusable helpers.
- Expose provider-based helpers through a shared module if they need DI.

**Never.**

- Import a feature module — `common/` sits below features in the dependency direction.
- Hold feature-specific logic; that belongs in the feature.
- Duplicate a helper into each feature; define it once here.

**Incorrect (a cross-cutting decorator copy-pasted per feature):**

```typescript
// modules/users/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(/* ... */);

// modules/orders/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(/* ... */); // the same code again
```

Why it is wrong: the same helper exists in several places and drifts as each copy is edited.

**Correct (one shared decorator in common/):**

```typescript
// common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    GqlExecutionContext.create(context).getContext().req.user,
);

// features import the one definition
import { CurrentUser } from '../../common/decorators/current-user.decorator';
```

Why it is right: defined once, used everywhere, and `common/` has no dependency on any feature.

Reference: [NestJS Custom Decorators](https://docs.nestjs.com/custom-decorators) | [NestJS Guards](https://docs.nestjs.com/guards)
