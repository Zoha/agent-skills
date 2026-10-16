---
title: Use Barrels and Path Aliases Deliberately
impact: MEDIUM
impactDescription: shallow barrels, import by alias, no deep cross-feature imports
tags: barrels, index, aliases, imports, conventions
---

## Use Barrels and Path Aliases Deliberately

**Impact: MEDIUM (shallow barrels, import by alias, no deep cross-feature imports)**

**Purpose.** Barrels (`index.ts`) and path aliases are conveniences with a cost: deep barrels hide
module boundaries and invite import cycles. Govern them explicitly. Use a barrel only at a module's
public edge (or a folder of like kinds), import across features through the module's public API, and
use a `@/` alias instead of fragile `../../..` chains.

**Placement.**

- Barrels: a single `index.ts` at a feature's public edge (or one per kind folder), never nested
  chains.
- Aliases: `tsconfig.json` `compilerOptions.paths` (for example `"@/*": ["src/*"]`,
  `"@common/*": ["src/common/*"]`).

**Responsibilities.**

- Re-export only the feature's public API from its barrel.
- Configure a small, stable set of path aliases.
- Import another feature through its public API, not into its internals.

**Never.**

- Re-export a feature's internals (repositories, entities, resolvers) from its barrel.
- Chain barrels (`a/index.ts` -> `b/index.ts` -> `c/index.ts`) so imports become cyclic and opaque.
- Import across features with deep relative paths into another feature's folders.

**Incorrect (deep relative import into another feature's internals):**

```typescript
// modules/orders/services/orders.service.ts
import { User } from '../../users/entities/user.entity';       // reaches into users internals
import { toUserModel } from '../../users/mappers/user.mapper';
```

Why it is wrong: orders couples to users' internals, so a refactor inside users breaks orders
silently.

**Correct (alias + the other feature's public API):**

```json
// tsconfig.json
{ "compilerOptions": { "paths": { "@/*": ["src/*"], "@common/*": ["src/common/*"] } } }
```

```typescript
// modules/orders/services/orders.service.ts
import { UsersService } from '@/modules/users/services/users.service'; // users' public API
import { DomainException } from '@common/exceptions/domain.exception';

constructor(private readonly usersService: UsersService) {}
```

Why it is right: imports use a stable alias and go through the other feature's public API, so
boundaries and refactors stay predictable.

Reference: [TypeScript Path Mapping](https://www.typescriptlang.org/tsconfig#paths) | [NestJS Modules](https://docs.nestjs.com/modules)
