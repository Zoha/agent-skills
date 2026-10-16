---
title: File Placement Table
impact: HIGH
impactDescription: one lookup answers "where does this file go?"
tags: placement, table, structure
---

## File Placement Table

**Impact: HIGH (one lookup answers "where does this file go?")**

**Purpose.** A single lookup from file kind to folder. Use it when you know what you are
creating but not where it belongs; the base structure rule (`struct-canonical-layout`) shows the
full tree, and the linked rule gives the file's purpose and examples.

**Placement.** This rule is the index; each row points to the rule that owns the file kind.

| File kind | Location | Rule |
|-----------|----------|------|
| Feature module | `modules/<f>/<f>.module.ts` | `module-feature-module` |
| App-level module (auth, health) | `modules/<name>/<name>.module.ts` | `struct-module-kinds` |
| Auth feature module | `modules/auth/auth.module.ts` | `struct-auth-feature` |
| Passport strategy | `modules/auth/strategies/<name>.strategy.ts` | `struct-auth-feature` |
| Query resolver | `modules/<f>/resolvers/<f>.query.resolver.ts` | `resolver-organization` |
| Mutation resolver | `modules/<f>/resolvers/<f>.mutation.resolver.ts` | `resolver-organization` |
| Cross-module field resolver | `modules/<f>/resolvers/<type>-<f>.resolver.ts` | `relations-owning-module` |
| Own-type field resolver | `modules/<f>/resolvers/<type>.resolver.ts` | `resolver-per-type` |
| Domain service | `modules/<f>/services/<f>.service.ts` | `service-single-responsibility` |
| Custom repository | `modules/<f>/repositories/<f>.repository.ts` | `data-repository` |
| GraphQL input | `modules/<f>/dto/create-<f>.input.ts` | `type-inputs` |
| GraphQL args | `modules/<f>/dto/find-<f>.args.ts` | `type-args` |
| Pagination args | `modules/<f>/dto/<f>-pagination.args.ts` | `type-pagination` |
| Constants / enums | `modules/<f>/constants/` | `conventions-constants-enums` |
| Feature-local exception | `modules/<f>/exceptions/<name>.exception.ts` | `infra-exceptions` |
| Persistence entity / object type | `modules/<f>/entities/<f>.entity.ts` | `data-entity-mongodb` |
| GraphQL-only model (split) | `modules/<f>/models/<f>.model.ts` | `data-models-mappers` |
| Mapper | `modules/<f>/mappers/<f>.mapper.ts` | `data-models-mappers` |
| DataLoader | `modules/<f>/loaders/<f>.loader.ts` | `relations-dataloader` |
| Domain event / listener | `modules/<f>/events/` | `relations-events` |
| Config namespace | `config/` | `infra-config` |
| Shared guard/filter/interceptor/pipe/scalar | `common/` | `infra-common` |
| Schema directive | `common/directives/<name>.directive.ts` | `infra-directives` |
| Shared type (context, auth user) | `common/types/<name>.ts` | `infra-common-types` |
| Shared/base exception | `common/exceptions/<name>.exception.ts` | `infra-exceptions` |
| Cross-cutting constant / enum | `common/constants/` | `conventions-constants-enums` |
| Shared page types | `common/pagination/` | `type-pagination` |
| Shared service | `common/services/<name>.service.ts` | `infra-shared-module` |
| Shared module | `common/shared.module.ts` | `infra-shared-module` |
| GraphQL setup / context | `infra/graphql/` | `infra-graphql` |
| DB setup / migrations | `infra/database/` | `infra-database` |
| Bootstrap | `main.ts` | `module-bootstrap` |
| Composition root | `app.module.ts` | `module-bootstrap` |
| Generated SDL | path from `autoSchemaFile` | `struct-schema-artifact` |
| Unit test | co-located `<name>.spec.ts` | `conventions-testing` |
| E2E test | `test/<f>.e2e-spec.ts` | `conventions-testing` |

**Never.**

- Invent a new folder for a file kind that already has a home above.
- Place a file by the feature that first needs it rather than by its role.

Every file kind resolves to exactly one folder here, so placement has a deterministic answer and
the structure stays consistent as the app grows.

Reference: [NestJS Modules](https://docs.nestjs.com/modules)
