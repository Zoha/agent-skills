---
title: Register Validation Rules Where the Driver Reads Them
impact: MEDIUM
impactDescription: the pre-v3 buildSchema option is gone; the plugin hook always works
tags: apollo, validation-rules, plugins, directives
---

## Register Validation Rules Where the Driver Reads Them

**Impact: MEDIUM (the pre-v3 buildSchema option is gone; the plugin hook always works)**

Depth and complexity rules are GraphQL **validation rules**, so they must be handed to the layer that
validates the document — the `ApolloServer` options, not a resolver and not the schema builder. Nest's
`@nestjs/apollo` forwards `validationRules` from the `GraphQLModule` config to `ApolloServer`. Two things
drift here and must be verified against your installed version (`driver-version-pinning`):

- the removed `buildSchema({ validationRules: [...] })` form (Apollo Server v2/v3) — do **not** use it;
- whether your `ApolloDriverConfig` type still accepts `validationRules`.

If the option is not forwarded, the guaranteed path is an Apollo **plugin**: validate in
`didResolveOperation` and throw. Same rule, different host hook.

**Incorrect (config that no longer exists, or rules strapped to the wrong place):**

```typescript
// removed in Apollo Server v3 — silently ignored, so nothing is validated
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  buildSchemaOptions: { validationRules: [depthLimit(10)] },
});
```

```typescript
// rules inside a resolver -> the document already executed past validation
@Query(() => [Item])
async items(@Context() ctx: GqlContext) {
  validate(ctx.schema, ctx.document, [depthLimit(10)]);   // too late
  return this.itemsService.findAll();
}
```

Why it is wrong: the first is dead config (the schema builds, the limit does not exist); the second runs
after the document has already been accepted and begun executing.

**Correct (rules on the server options; the plugin as the portable fallback):**

```typescript
// infra/graphql/graphql.module.ts — the primary form; verify your version forwards it
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  validationRules: [depthLimit(10), createComplexityRule({ /* ... */ })],
  buildSchemaOptions: { directives: [ComplexityDirective] },   // directives still go here
});
```

```typescript
// infra/graphql/depth-limit.plugin.ts — the fallback that works on any Apollo version
import { specifiedRules, validate } from 'graphql';

export const depthRulePlugin = (maxDepth: number): ApolloServerPlugin => ({
  async requestDidStart() {
    return {
      async didResolveOperation({ document, schema, request }) {
        const rule = depthLimit(maxDepth);
        const errors = validate(schema, document, [...specifiedRules, rule]);
        if (errors.length) throw errors[0];       // `obs-error-shape` shapes the client-facing error
      },
    };
  },
});
```

Why it is right: the rules run inside validation (before any resolver), and the plugin form is independent
of whether the driver forwards the option — so the limit exists on every Apollo version.

Rules of thumb:

- **`validationRules` and `buildSchemaOptions.directives` are different slots.** Directives (the
  `@complexity` annotation) are declared in `buildSchemaOptions`; the rules that enforce the limits go in
  `validationRules`. Putting an enforcement rule in `buildSchemaOptions` is the classic dead config.
- **Apollo Server 5 changed directive declaration** — it no longer auto-inserts a directive, so a
  directive used on a field must be declared (`buildSchemaOptions.directives`) or code-first generation
  drops it (`field-cost-weights`).
- **Confirm the boundary in e2e**, not by reading config: a document that should be rejected must be
  rejected (`test-e2e-limits`).
- **On Mercurius**, the equivalent is the driver's own validation/plugin hooks — same rule, wired where
  that driver reads it (`driver-alignment`).

Reference: [Apollo Server plugins](https://www.apollographql.com/docs/apollo-server/integrations/plugins/) | [GraphQL Armor](https://escape.tech/graphql-armor/)
