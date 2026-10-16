# NestJS GraphQL Structure Skill — Design Spec

**Date:** 2026-10-16
**Status:** Approved (design), pending implementation plan

## 1. Overview & Goals

Add a new skill, `nestjs-graphql-structure`, to this repo. Unlike `nestjs-best-practices`
(which covers framework behavior — DI, security, error handling, performance), this skill
teaches **where every file in a NestJS GraphQL application goes and how each file works**.

The skill is a *placement + anatomy* guide: an agent asked to create, move, or review a file
in a NestJS GraphQL codebase should be able to consult it and know exactly which folder the
file belongs in, what its responsibilities are, what it must not contain, and see a
good/bad example.

Goals:

- One **base-structure rule** holding the complete annotated directory map — every possible
  file in `src/` and inside a feature module, each with a one-line purpose.
- **One rule per file kind** giving the purpose, placement, naming, responsibilities, a
  good/bad code example, and references.
- A **file-placement table** so any file kind resolves to exactly one folder.
- Match the repo's generator conventions exactly (`SKILL.md` index with `GENERATED` markers,
  `metadata.json`, `rules/_sections.md`, `rules/_template.md`, compiled `AGENTS.md`).
- Build cleanly with `cd scripts && npm run build`.

Non-goals:

- Not a behavioral best-practices guide — security, DI depth, performance, error handling,
  microservices, and DevOps stay in `nestjs-best-practices` (cross-reference, don't duplicate).
- Not schema-first GraphQL (code-first only), not Nx monorepo (single feature-first app).
- No documentation website, no CI.

## 2. Relationship to `nestjs-best-practices`

- The new skill owns **layout, module anatomy, schema/type placement, resolver placement,
  and cross-module field/relation resolution**.
- Where a structural concern already exists in `nestjs-best-practices` (feature modules,
  circular dependencies, repository pattern, module sharing), the new skill restates it
  **through a structure/placement lens** (concrete folders, file responsibilities) and
  cross-references the other skill for behavioral depth.
- The new skill must not copy security, DI-internals, performance, error-handling, testing
  tooling, microservices, or DevOps rules.

### 2.1 Two classes of rules (structure vs module-resolution)

Rules in this skill fall into two classes. The taxonomy, the base map, and the index must
accommodate **both**, because this skill is not only about the directory structure:

- **Structure rules** — where a file lives and how it is shaped: directory layout, module
  anatomy, file responsibilities, placement. Most rules are of this kind.
- **Module-resolution rules** — how modules connect to and resolve one another at runtime,
  and how to resolve connection problems. These are *not* directory-layout rules even though
  they are grouped under structural sections. Examples to be added over time: resolving
  **circular module dependencies**, choosing `forwardRef` vs a shared module vs events,
  wiring a cross-module service for a field resolver, per-request DataLoader scope, module
  graph acyclicity, breaking a dependency cycle.

No module-resolution rule is authored in the first deliverable (Steps 1–2), but the section
taxonomy (§6), the base map (§7), and the `SKILL.md` index (§11) explicitly reserve space for
them, so the ones we later add are considered a first-class part of this skill. Their natural
homes are Section 2 (`module-`) and Section 7 (`relations-`).

## 3. Fixed design decisions

| Decision | Choice |
|----------|--------|
| GraphQL paradigm | Code-first (`@ObjectType`, `@InputType`, `@Resolver`, `@ResolveField`) |
| Application topography | Single app, feature-first (`src/modules/<feature>/`) |
| Resolver placement | Co-located inside the owning feature module |
| Persistence entity vs GraphQL type | Merged by default (`entities/*.entity.ts` carries both); split into `models/` + `mappers/` only when the API shape diverges from storage |
| Services | A `services/` subfolder per module; **multiple** single-responsibility services, not one god service |
| Base rule detail | Lean map — every file listed with a one-line purpose; detailed good/bad examples live only in per-file rules |

Authoritative basis: the NestJS docs' GraphQL "Resolvers → Module" guidance recommends the
**domain-model organization** — models (`@ObjectType`), resolvers, and services kept together
in the Nest module that represents the domain model, one folder per module.

## 4. Skill anatomy (generator-conformant)

```
skills/nestjs-graphql-structure/
├── SKILL.md               # hand-written index + GENERATED marker sections
├── metadata.json          # title, version, organization, date, abstract, references
├── AGENTS.md              # GENERATED compiled document (committed)
└── rules/
    ├── _sections.md       # section taxonomy: order, name, prefix, impact
    ├── _template.md       # template for new rules
    ├── struct-canonical-layout.md   # base structure rule (the map)
    └── <prefix>-<file>.md           # per-file rules
```

Generator constraints (from `scripts/build-agents.ts`) the spec must honour:

- `SKILL.md` needs two marker pairs: `GENERATED:START/END:sections` (priority table) and
  `GENERATED:START/END:rules` (quick reference). Missing pairs = hard build error.
- Each rule file needs YAML frontmatter with `title` and `impact`; the filename prefix must
  match a prefix declared in `rules/_sections.md`, else the rule is skipped.
- `metadata.json` must contain `title`, `version`, `organization`, `date`, `abstract`,
  `references[]`.

## 5. Rule model

- **Base structure rule** (`struct-canonical-layout`): the complete tree. For each file it
  gives name + one-line purpose. It is the map; it contains no good/bad code snippets.
- **Per-file rule** (`<prefix>-<slug>`): one file kind per rule, containing:
  1. Purpose (what the file is for, in 2–4 sentences).
  2. Placement (exact folder) + naming convention.
  3. Responsibilities (bullets: what it does).
  4. Anti-responsibilities (bullets: what it must never contain).
  5. **Incorrect** code example with explanation.
  6. **Correct** code example with explanation.
  7. Reference(s).
- Coverage invariant: every file listed in the base map should eventually have exactly one
  per-file rule. A file with no rule is a known gap, filled in a later step.

## 6. Section taxonomy

| # | Section | Prefix | Impact |
|---|---------|--------|--------|
| 1 | Application Structure | `struct-` | CRITICAL |
| 2 | Modules & Bootstrap | `module-` | CRITICAL |
| 3 | Services | `service-` | HIGH |
| 4 | GraphQL Resolvers | `resolver-` | HIGH |
| 5 | GraphQL Types & Inputs | `type-` | HIGH |
| 6 | Data Access | `data-` | MEDIUM-HIGH |
| 7 | Relations & Cross-Module | `relations-` | CRITICAL |
| 8 | Config, Common & Infra | `infra-` | MEDIUM |
| 9 | Conventions & Testing | `conventions-` | MEDIUM |

> Note: Sections 2 (`module-`) and 7 (`relations-`) are the designated homes for the
> **module-resolution rules** described in §2.1 (circular-dependency resolution, cross-module
> wiring, loader scope). They are reserved now so those rules are added there consistently,
> even though none exist in the first deliverable.

## 7. Base structure rule content (`struct-canonical-layout`)

The rule contains this annotated map (one line of purpose per file):

```
src/
├── main.ts                        # bootstrap only: create app, global pipes/filters/interceptors, listen
├── app.module.ts                  # composition root: imports feature + infra modules, no logic
├── config/
│   ├── app.config.ts              # typed config namespace (registerAs)
│   ├── database.config.ts         # typed config namespace
│   └── validation.schema.ts       # env validation (Joi/Zod) — fail fast
├── common/                        # feature-agnostic, reusable building blocks
│   ├── decorators/                # e.g. @CurrentUser()
│   ├── filters/                   # GraphQL exception filters
│   ├── guards/                    # shared auth/roles guards
│   ├── interceptors/              # logging, transform
│   ├── pipes/                     # shared validation/parse pipes
│   ├── scalars/                   # custom GraphQL scalars
│   └── utils/
├── infra/                         # one-time infrastructure, imported by the composition root
│   ├── database/
│   │   ├── database.module.ts     # DB connection module
│   │   ├── database.providers.ts  # provider/factory wiring
│   │   └── migrations/            # DB migrations
│   ├── graphql/
│   │   ├── graphql.module.ts      # GraphQLModule.forRootAsync + schema config
│   │   └── graphql.context.ts     # per-request context: request + authenticated user
│   └── <cache|queue|…>/           # other one-time infra
└── modules/
    └── <feature>/                 # one folder per bounded context
        ├── <feature>.module.ts           # wiring: providers, imports, exports
        ├── resolvers/
        │   ├── <feature>.query.resolver.ts      # queries
        │   ├── <feature>.mutation.resolver.ts   # mutations
        │   └── <feature>.field.resolver.ts      # @ResolveField relations
        ├── services/
        │   └── <feature>.service.ts             # domain logic (multiple per module)
        ├── repositories/
        │   └── <feature>.repository.ts          # data access only
        ├── dto/
        │   ├── create-<feature>.input.ts        # @InputType (+class-validator)
        │   └── find-<feature>.args.ts           # @Args() class
        ├── entities/
        │   └── <feature>.entity.ts              # persistence + @ObjectType (merged default)
        ├── models/                              # OPTIONAL: GraphQL-only @ObjectType (split case)
        ├── mappers/                             # OPTIONAL: entity ⟷ model / _id → id
        ├── loaders/
        │   └── <feature>.loader.ts              # DataLoader(s) for relations
        ├── events/
        │   ├── <feature>-<action>.event.ts      # domain event
        │   └── <feature>-<action>.listener.ts   # listener
        └── guards/                              # OPTIONAL: feature-local guards/decorators
test/
└── <feature>.e2e-spec.ts          # e2e specs (unit specs are co-located)
```

## 8. File placement table (part of the skill)

A lookup table mapping file kind → folder, e.g.

| File kind | Location |
|-----------|----------|
| GraphQL query/mutation/field resolver | `modules/<f>/resolvers/` |
| Domain service | `modules/<f>/services/` |
| Custom repository | `modules/<f>/repositories/` |
| GraphQL input / args | `modules/<f>/dto/` |
| Persistence entity / GraphQL object type | `modules/<f>/entities/` (or `models/` when split) |
| DataLoader | `modules/<f>/loaders/` |
| Domain event / listener | `modules/<f>/events/` |
| Config namespace | `config/` |
| Shared guard/filter/interceptor/pipe/scalar | `common/` |
| DB/GraphQL/cache setup | `infra/` |
| Migration | `infra/database/migrations/` |
| e2e test | `test/` |
| unit test | co-located `<name>.spec.ts` |

## 9. Build steps

**Step 1 — Scaffold + base map (first deliverable)**
Create `skills/nestjs-graphql-structure/` with `SKILL.md` (index), `metadata.json`,
`rules/_sections.md`, `rules/_template.md`, and `rules/struct-canonical-layout.md`
(§7 content). Run `npm run build`; confirm the index's marker sections regenerate.

**Step 2 — Core file rules (first deliverable)**
Each a full per-file rule (§5 model):
- `service-single-responsibility` — several focused services under `services/`.
- `type-inputs` — `@InputType` DTOs under `dto/` with validation.
- `data-entity-mongodb` — merged MongoDB (`@nestjs/mongoose`) entity + `@ObjectType`,
  sensitive fields excluded from the schema; includes the split variant pointer.
- `resolver-organization` — resolver splitting (query/mutation/field) and thinness.

**Step 3 — Remaining module files**
`module-feature-module`, `data-repository`, `data-models-mappers`, `type-args`.

**Step 4 — Relations**
`relations-field-resolvers`, `relations-dataloader`, `relations-cross-module-service`,
`relations-events`, `relations-avoid-circular`.
This section also hosts **module-resolution rules** (§2.1) — e.g. circular-dependency
resolution strategies and cross-module wiring — which are not directory-layout rules.

**Step 5 — App-level**
`module-bootstrap`, `infra-config`, `infra-common`, `infra-graphql`, `infra-database`,
`struct-schema-artifact`.

**Step 6 — Conventions**
`conventions-naming`, `conventions-testing`, `conventions-cli-generator`,
`struct-file-placement-table`.

**Step 7 — Build, verify, review, commit.**

Later steps add rules one by one: either explaining a file already in the base map, or
adding a new file to the map together with its rule.

## 10. `metadata.json`

```json
{
  "title": "NestJS GraphQL Application Structure",
  "version": "1.0.0",
  "organization": "NestJS GraphQL Structure",
  "date": "October 2026",
  "abstract": "File-placement and anatomy guide for NestJS GraphQL applications, designed for AI agents and LLMs. Teaches where every file belongs in a feature-first code-first codebase — the base structure map plus per-file rules for modules, services, resolvers, inputs, entities, repositories, loaders, and events — each with purpose, responsibilities, and incorrect-vs-correct examples.",
  "references": [
    "https://docs.nestjs.com/modules",
    "https://docs.nestjs.com/graphql/resolvers",
    "https://docs.nestjs.com/graphql/mapped-types",
    "https://docs.nestjs.com/fundamentals/dynamic-modules",
    "https://docs.nestjs.com/techniques/mongodb",
    "https://docs.nestjs.com/cli/overview",
    "https://github.com/graphql/dataloader",
    "https://encore.dev/articles/nestjs-project-structure-best-practices"
  ]
}
```

## 11. `SKILL.md` index content

- Frontmatter: `name: nestjs-graphql-structure`; `description` triggering on
  placement/structure/organization/relation-resolution tasks; `license: MIT`;
  `metadata.author` + `metadata.version`.
- Body: intro; **When to Apply**; `GENERATED:START:sections` priority table;
  `GENERATED:START:rules` quick reference; **How to Use**; **Full Compiled Document**
  pointing at `./AGENTS.md`; a short callout to consult `struct-canonical-layout` first
  and `nestjs-best-practices` for behavioral rules.
- Add a short index note stating the skill covers **both structure rules and
  module-resolution rules** (§2.1), so future circular-dependency/wiring rules are expected
  here rather than treated as out of scope.

## 12. Sources & references to cite

- NestJS — Modules, GraphQL Resolvers/Schema/Interfaces/Federation, Mapped Types,
  Dynamic Modules, MongoDB, CLI/Workspaces.
- NestJS GraphQL docs' "domain model organization" guidance (keep models, resolvers, and
  services in one folder per module).
- graphql/dataloader; DataLoader-in-NestJS guides (per-request loader pattern).
- Structural community articles (encore.dev 2026 project-structure guide).

## 13. Acceptance criteria

- `skills/nestjs-graphql-structure/` builds with `npm run build`; no skipped rules.
- `AGENTS.md` and the `SKILL.md` marker sections are generated and committed.
- The base rule contains the full map from §7 with a one-line purpose for every file.
- Each per-file rule follows the §5 model and includes a good and a bad example.
- The priority table and quick reference list every section/rule (no stale entries).
- No rule duplicates a `nestjs-best-practices` behavioral rule; structural overlaps
  cross-reference it.
- The section taxonomy and index explicitly reserve space for **module-resolution rules**
  (§2.1) in `module-` and `relations-`, even when none exist yet.

## 14. Implementation note (2026-10-16)

Implemented as v1.1.0 (30 → 36 rules). Six rules were added beyond the initial deliverable,
covering real-project structure gaps: `struct-auth-feature`, `struct-module-kinds`,
`infra-exceptions`, `infra-common-types`, `infra-directives`, and `type-pagination`.

- **Pagination policy.** Cursor/Relay connections are the default (`type-pagination`); offset
  (`page`/`limit`) is allowed only for small, bounded lists. `type-args` now cross-references
  `type-pagination` for this reason.
- **DataLoader scope.** This supersedes the §7 tree comment. DataLoaders are **request-scoped
  providers** injected where used (see `infra-graphql` and `relations-dataloader`), not built into
  the GraphQL context object.
- **Base map additions.** `common/{constants,directives,exceptions,pagination,types}/`, app-level
  modules (`auth/`, `health/`), and feature `exceptions/` — all reflected in `struct-canonical-layout`.
