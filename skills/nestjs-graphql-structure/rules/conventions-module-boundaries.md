---
title: Enforce Module Boundaries with Lint
impact: MEDIUM
impactDescription: the folder rules are checked, not just documented
tags: boundaries, eslint, architecture, conventions
---

## Enforce Module Boundaries with Lint

**Impact: MEDIUM (the folder rules are checked, not just documented)**

**Purpose.** Structure rules decay unless they are enforced. Add lint rules that encode the
dependency direction this skill teaches: `common/` never imports a feature; a feature imports another
feature only through its public API (its exported services), not its repositories, entities, or
resolvers; and `infra/` is imported only by the composition root. A boundaries plugin makes these
violations a CI failure instead of a review comment.

**Placement.** ESLint config at the repository root (`eslint.config.js`), with an architecture plugin
such as `eslint-plugin-boundaries`. No file lives in `src/` for this rule.

**Responsibilities.**

- Declare element types for `common/`, `infra/`, and each `modules/<feature>/`.
- Allow the dependency directions this skill defines; forbid the rest.
- Run lint in CI so a violation blocks the merge.

**Never.**

- Rely on convention alone for a boundary that matters (feature → feature internals).
- Let a lint suppression silently allow a boundary violation.
- Point a feature at another feature's repository, entity, or resolver.

**Incorrect (no boundary rule; internals imported freely):**

```typescript
// modules/orders/services/orders.service.ts
import { UsersRepository } from '../../users/repositories/users.repository'; // deep into users
import { UserEntity } from '../../users/entities/user.entity';
```

Why it is wrong: nothing stops one feature from reaching into another's internals, so the module
boundary exists only on paper and erodes on the next refactor.

**Correct (boundaries declared and enforced in lint):**

```javascript
// eslint.config.js (eslint-plugin-boundaries)
{
  settings: {
    'boundaries/elements': [
      { type: 'common', pattern: 'src/common/**' },
      { type: 'infra', pattern: 'src/infra/**' },
      { type: 'feature', pattern: 'src/modules/**', capture: ['feature'] },
    ],
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        { from: 'feature', allow: ['common', 'feature'] }, // feature -> feature: public API only
        { from: 'common', allow: ['common'] },             // common never imports a feature
        { from: 'infra', allow: ['common'] },
      ],
    }],
  },
}
```

Why it is right: the dependency direction is machine-checked, so a misplaced import fails CI rather
than silently eroding the structure.

Reference: [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | [NestJS Modules](https://docs.nestjs.com/modules)
