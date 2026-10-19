---
title: Cap Breadth: Aliases, Root Fields, Selections
impact: HIGH
impactDescription: depth limits do not stop a wide document, and aliases repeat a field for free
tags: aliases, breadth, depth-limit, selections
---

## Cap Breadth: Aliases, Root Fields, Selections

**Impact: HIGH (depth limits do not stop a wide document, and aliases repeat a field for free)**

Depth counts how *deep* a document goes; it says nothing about how *wide* it is. An alias lets a client
run the same expensive field many times in one operation without nesting:

```graphql
{ a: search(term: "x") { ... } b: search(term: "x") { ... } /* ... 40 more ... */ }
```

Every alias is a separate resolver invocation at the same depth, so a depth cap of 10 does not see it.
Bound the breadth too.

**Incorrect (only a depth rule):**

```typescript
validationRules: [depthLimit(10)];   // { a: expensive b: expensive ... } passes
```

Why it is wrong: the document is shallow, so the depth cap never fires, yet one request performs fifty
expensive operations.

**Correct (bound aliases, root fields and total selections):**

```typescript
// infra/graphql/graphql.module.ts — a small breadth rule alongside depth and cost
validationRules: [
  depthLimit(10),
  breadthLimit({ maxAliases: 15, maxRootFields: 10, maxSelections: 200 }),
  createComplexityRule({ /* ... */ }),   // `op-cost-based-limits` is the general-purpose answer
];
```

```typescript
// infra/graphql/breadth-limit.rule.ts — count the shapes that amplify
export function breadthLimit(
  opts: { maxAliases: number; maxRootFields: number; maxSelections: number },
): ValidationRule {
  return (context) => ({
    OperationDefinition(node) {
      const { aliases, selections } = countNode(node);   // one walk, two counters
      if (aliases > opts.maxAliases) {
        context.reportError(new GraphQLError(`Too many aliases (${aliases} > ${opts.maxAliases})`));
      }
      if (selections > opts.maxSelections) {
        context.reportError(new GraphQLError(`Too many selections (${selections} > ${opts.maxSelections})`));
      }
      return false;   // walked manually above
    },
  });
}
```

Why it is right: aliasing stops being a free multiplier, a shallow-but-huge document is rejected in
validation, and the cost rule is the fallback that prices shapes this rule does not name.

Notes:

- **The cost model already prices aliases** if your estimator walks them (`op-cost-based-limits`) — a
  breadth rule is the cheap, explicit belt to that braces. Use one of them deliberately, not both with
  no idea which fires.
- **Root-field caps** (`maxRootFields`) also blunt the "fan-out" query that resolves many unrelated
  top-level fields in one call.
- **Apollo Router** exposes `max_aliases`, `max_root_fields`, and `max_recursive_selections` as
  configuration if you terminate at the router; in-app, implement the rule above or use a maintained
  security plugin such as GraphQL Armor (`depth-validation-rule` names where it is registered).
- **`graphql-no-alias`** is the narrow, single-purpose version of this rule; prefer it over a bespoke
  counter if you only need the alias cap.

Reference: [graphql-query-complexity](https://github.com/slicknode/graphql-query-complexity) | [GraphQL Armor](https://escape.tech/graphql-armor/)
