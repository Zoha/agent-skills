---
title: Test File Placement
impact: MEDIUM
impactDescription: tests live next to what they test
tags: testing, e2e, spec
---

## Test File Placement

**Impact: MEDIUM (tests live next to what they test)**

**Purpose.** Unit tests are co-located with the code they cover, named `<name>.spec.ts`.
End-to-end tests live in a top-level `test/` folder. Neither lives in a technical `tests/`
layer, and tests follow the same feature-first organization as the code.

**Placement.** Unit: beside the subject, for example
`modules/<feature>/services/<feature>.service.spec.ts`. E2E: `test/<feature>.e2e-spec.ts`.

**Responsibilities.**

- Keep unit tests beside their subject.
- Keep e2e tests in `test/`.
- Mirror the feature structure in test names.

**Never.**

- Put unit tests in a separate top-level layer.
- Mix e2e specs among unit specs.
- Let the test layout diverge from the source layout.

**Incorrect (parallel technical layer, e2e mixed with unit):**

```text
src/
└── __tests__/
    ├── usersService.test.ts   # separated from its subject
    └── e2e-users.test.ts      # e2e mixed into the unit folder
```

Why it is wrong: tests are detached from their subjects and the two kinds are mixed, so neither
is easy to find or run.

**Correct (unit co-located, e2e in test/):**

```text
modules/users/services/
├── users.service.ts
└── users.service.spec.ts       # unit, beside its subject
test/
└── users.e2e-spec.ts           # e2e, one home
```

Why it is right: a unit test sits with its subject, and every e2e test has one place.

Reference: [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
