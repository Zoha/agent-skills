---
title: Test the Rules on Documents, Table-Driven
impact: MEDIUM
impactDescription: the depth/cost rules are pure functions of a document — test them as such
tags: testing, depth-limit, complexity, validation-rules
---

## Test the Rules on Documents, Table-Driven

**Impact: MEDIUM (the depth/cost rules are pure functions of a document — test them as such)**

The depth and complexity rules take a **document** and return errors; they need no HTTP, no guard and no
storage. Test them directly with `validate(schema, document, [...specifiedRules, rule])` in a
table-driven suite that pins both sides of the boundary: documents that must pass, and documents that
must be rejected, with the exact error. This is where "clear and without bug" is actually proven — a
depth cap that rejects a legitimate screen, or a cost model that under-prices a list, is caught here and
nowhere else.

**Incorrect (only an integration test that fires one nested query):**

```typescript
it('rejects a deep query', async () => {
  const res = await gql(app, deepQuery);
  expect(res.body.errors).toBeDefined();       // does not say why, or where the boundary is
});
```

Why it is wrong: it tests one shape, cannot distinguish a depth rejection from a 500, and never checks
that legitimate nesting still passes.

**Correct (table-driven: both sides of the boundary, and the reason):**

```typescript
// infra/graphql/depth-limit.spec.ts
const cases = [
  { name: 'accepts a legitimate deep query', doc: legitDeepQuery, depth: 10, ok: true },
  { name: 'rejects one level past the cap', doc: oneTooDeep, depth: 10, ok: false },
  { name: 'rejects a self-referential cycle', doc: friendsOfFriendsOfFriends, depth: 10, ok: false },
  { name: 'ignores introspection depth', doc: introspectionQuery, depth: 10, ok: true },
];

describe('depth limit rule', () => {
  it.each(cases)('$name', ({ doc, depth, ok }) => {
    const errors = validate(schema, parse(doc), [...specifiedRules, depthLimit(depth)]);
    expect(errors.length === 0).toBe(ok);
    if (!ok) expect(errors[0].message).toMatch(/exceeds maximum operation depth/i);
  });
});
```

```typescript
// infra/graphql/complexity.spec.ts — pin the price of a list at both ends
const costCases = [
  { name: 'prices a scalar query at its base cost', doc: '{ me { id } }', cost: 3 },
  { name: 'multiplies a list by `first`', doc: '{ search(first: 50) { id } }', cost: 500 },
  { name: 'rejects a query above the ceiling', doc: '{ search(first: 100) { id } }', over: 1000 },
];

it('prices and caps by the same estimator chain', () => {
  const onComplete = jest.fn();
  const rule = createComplexityRule({
    maximumComplexity: 1000,
    estimators: [directiveEstimator(), simpleEstimator({ defaultComplexity: 1 })],
    onComplete,
  });
  const errors = validate(schema, parse(costCases[1].doc), [...specifiedRules, rule]);
  // onComplete receives { [operationName]: cost }, not a single number
  const [reported] = onComplete.mock.calls.at(-1) as [Record<string, number>];
  expect(Object.values(reported)).toContain(costCases[1].cost);
  expect(errors).toHaveLength(0);
});
```

Why it is right: every boundary is pinned with a document, a legitimate query is proven to pass, the
rejection reason is asserted, and the run is pure and instant.

Rules of thumb:

- **Both sides of every boundary.** For each limit, one document just under and one just over — a suite
  that only tests rejections will happily ship a limit that rejects everything.
- **Assert the error message/code**, not merely that *an* error occurred, so a depth rejection cannot be
  mistaken for a complexity rejection.
- **Test the estimator chain directly** for the list multiplier (`field-list-multipliers`) — that is the
  single most likely place for a silent pricing bug.
- **The same table becomes documentation.** Name each case for the rule it proves; a reviewer learns the
  limits from the test names.
- **This is not a substitute for the e2e check** (`test-e2e-limits`) — the rule being correct and the rule
  being wired are two different failures.

Reference: [graphql-js validate](https://graphql.org/graphql-js/validation/) | [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity)
