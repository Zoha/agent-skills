---
title: Use the Nest CLI Generator, Then Adjust
impact: MEDIUM
impactDescription: scaffold with the generator, then place files per this skill
tags: cli, generator, schematics
---

## Use the Nest CLI Generator, Then Adjust

**Impact: MEDIUM (scaffold with the generator, then place files per this skill)**

**Purpose.** Use `nest g` to scaffold boilerplate, then move and adjust the generated files to
the canonical structure. The generator wires providers and imports for you; this skill decides
the final layout. Enable the GraphQL CLI plugin so the generator and compiler infer `@Field`
types.

**Placement.** Run from the project root; adjust the generated files into `modules/<feature>/`.

**Responsibilities.**

- Scaffold with `nest g resource <feature>` (GraphQL transport) or
  `nest g module|service|resolver`.
- Move generated files into the canonical subfolders.
- Enable the `@nestjs/graphql` plugin in `nest-cli.json`.

**Never.**

- Hand-write boilerplate the generator produces.
- Leave generated files in a default layout that differs from this skill.
- Ship a `nest-cli.json` without the GraphQL plugin in a code-first GraphQL app.

**Incorrect (no plugin, flat default layout):**

```json
// nest-cli.json
{ "collection": "@nestjs/schematics", "sourceRoot": "src" }
```

Why it is wrong: without the plugin every `number` and nullable field needs a hand-written type
function, and a generated resource lands flat and then has to be reorganized by hand.

**Correct (plugin enabled, scaffold then place):**

```json
// nest-cli.json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "plugins": [
      {
        "name": "@nestjs/graphql",
        "options": { "typeFileNameSuffix": [".input.ts", ".model.ts", ".entity.ts"] }
      }
    ]
  }
}
```

```bash
nest g resource users
# then move the generated files into modules/users/{resolvers,services,dto,entities}/ per this skill
```

Why it is right: boilerplate and wiring are generated and type metadata is inferred, while the
final layout still follows this skill.

Reference: [NestJS CRUD Generator](https://docs.nestjs.com/recipes/crud-generator) | [NestJS CLI Plugin](https://docs.nestjs.com/cli/overview)
