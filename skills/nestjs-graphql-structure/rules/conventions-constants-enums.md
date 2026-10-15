---
title: Keep Constants and Enums Out of Class Files
impact: MEDIUM
impactDescription: one home per value; class files contain only their class
tags: constants, enums, organization, conventions
---

## Keep Constants and Enums Out of Class Files

**Impact: MEDIUM (one home per value; class files contain only their class)**

**Purpose.** A class file (`*.service.ts`, `*.resolver.ts`, `*.module.ts`, …) should contain its
class and nothing else. Constants, enums, and standalone helper functions declared at the top of
a class file have no home, cannot be reused or tested on their own, and invite copies that drift.
Give each of them its own file.

**Placement.**

- Feature-specific values: `modules/<feature>/constants/<name>.constants.ts` and
  `modules/<feature>/constants/<name>.enum.ts`.
- Cross-cutting values: `common/constants/`.

**Responsibilities.**

- Export named, typed constants and enums from a dedicated file.
- Name them for the concept (`UserStatus`, `MAX_PAGE_SIZE`).

**Never.**

- Declare a `const`, `enum`, or standalone helper at the top of a service, resolver, or module
  file.
- Inline magic literals in methods when a named constant or enum already exists.
- Park "a couple of helpers" in whatever class file first needed them.

**Incorrect (values buried in a class file):**

```typescript
// services/users.service.ts
const MAX_PAGE_SIZE = 100;                              // buried here, reusable nowhere
enum Status { Active = 'active', Banned = 'banned' }    // declared inside a class file

@Injectable()
export class UsersService {
  async findAll(page: number, limit: number) {
    if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;
    // ...
  }
}
```

Why it is wrong: the value and the enum live only in this file; the next feature that needs
`MAX_PAGE_SIZE` copies it, and the two copies drift.

**Correct (dedicated files, imported where needed):**

```typescript
// constants/user.constants.ts
export const MAX_PAGE_SIZE = 100;

// constants/user-status.enum.ts
export enum UserStatus {
  Active = 'active',
  Banned = 'banned',
}

// services/users.service.ts
import { MAX_PAGE_SIZE } from '../constants/user.constants';

@Injectable()
export class UsersService {
  async findAll(page: number, limit: number) {
    return this.usersRepository.findMany({
      page,
      limit: Math.min(limit, MAX_PAGE_SIZE),
    });
  }
}
```

Why it is right: each value has one home and one name, and class files stay about their class.

A GraphQL enum that must be registered code-first also lives in its own file and is registered
once with `registerEnumType` (see the GraphQL enums docs).

Reference: [TypeScript Enums](https://www.typescriptlang.org/docs/handbook/enums.html) | [NestJS GraphQL Unions and Enums](https://docs.nestjs.com/graphql/unions-and-enums)
