---
title: Cap Self-Referential Depth
impact: CRITICAL
impactDescription: a cycle in the graph is the real amplification vector
tags: depth-limit, cycles, graphile, friends-of-friends
---

## Cap Self-Referential Depth

**Impact: CRITICAL (a cycle in the graph is the real amplification vector)**

The dangerous depth is not a deep chain of *distinct* types — it is the same field re-entering itself:
`friends { friends { friends { ... } } }`, `comment { replies { replies { ... } } }`,
`category { parent { parent { ... } } }`. A flat depth cap catches it, but it also over-charges normal
nesting, and a per-type cap is more honest: allow "friends of friends" (depth 2) and reject the third.

`graphile/depth-limit` exists precisely for this: it caps how many times a field coordinate may recur,
with per-coordinate overrides.

**Incorrect (one global depth number, blind to cycles):**

```typescript
validationRules: [depthLimit(15)];
// { friends { friends { ... 14 more ... } } } is "depth 15" and allowed; a legitimate
// { order { lines { product { category { parent } } } } } is only depth 5 but counts the same way
```

Why it is wrong: a cyclic field is allowed as deep as any other field, so the one shape that amplifies
is not treated specially, and the limit that would stop it is set high to accommodate honest nesting.

**Correct (a low self-referential cap with per-field overrides):**

```typescript
// infra/graphql/graphql.module.ts
import { createDepthLimitRule } from '@graphile/depth-limit';

validationRules: [
  createDepthLimitRule({
    maxDepth: 10,
    maxSelfReferentialDepth: 2,                      // friends of friends, never friends^3
    maxDepthByFieldCoordinates: { 'User.friends': 2, 'Comment.replies': 3 },
  }),
];
```

```graphql
# allowed: two hops — "friends of friends"
{ me { friends { friends { id } } } }

# rejected at validation: the third hop re-enters the same field
{ me { friends { friends { friends { id } } } } }
```

Why it is right: the rule targets the amplifying shape directly, honest nesting keeps its own budget,
and the exception for a field that legitimately recurs (a comment thread) is declared in one place.

Notes:

- **`graphql-depth-limit` counts depth including fragments but has no self-referential notion.** If you
  only need "no document deeper than N", it is enough (`depth-validation-rule`); if your schema has
  cycles, use the coordinate-aware rule. Either way, verify the package and its API against your
  pinned versions.
- **Fragments and inline fragments count.** A cycle hidden behind a fragment spread is still a cycle;
  make sure the rule flattens fragments.
- **Recursive relations are usually a DataLoader problem too** — batching (`relations-dataloader` in
  the `nestjs-graphql-structure` skill) removes N+1 but not the depth; the depth cap is still required.

Reference: [graphile/depth-limit](https://github.com/graphile/depth-limit) | [graphql-depth-limit](https://www.npmjs.com/package/graphql-depth-limit)
