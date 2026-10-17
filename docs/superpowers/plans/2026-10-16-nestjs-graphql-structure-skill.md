# NestJS GraphQL Structure Skill Implementation Plan

> **Superseded (kept for the record).** This plan describes v1.0.0 with 24 rules and sections
> ordered Services (3) / Relations (7). The shipped skill is at v1.4.x with 52 rules, sections
> ordered Relations (3) / Services (4), and `relations-owning-module` in place of
> `relations-cross-module-service`. Treat the shipped rules as the source of truth, not this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `nestjs-graphql-structure` skill — an index (`SKILL.md`) plus a `rules/` folder with one base-structure map rule and per-file anatomy rules — to this repo, buildable with the existing generator.

**Architecture:** Each rule is a markdown file with YAML frontmatter (`title`, `impact`, optional `impactDescription`, `tags`) whose filename prefix matches a section in `rules/_sections.md`. The generator (`scripts/build-agents.ts`) compiles rules into `AGENTS.md` and regenerates the `GENERATED` marker sections of `SKILL.md`. The base rule holds the full annotated tree; per-file rules hold purpose + good/bad examples.

**Tech Stack:** Markdown, the repo's `scripts` generator (`tsx`), Git.

**Spec:** `docs/superpowers/specs/2026-10-16-nestjs-graphql-structure-skill-design.md`

## Global Constraints

- Everything lives under `skills/nestjs-graphql-structure/`.
- Skill name (SKILL.md frontmatter `name` and folder): `nestjs-graphql-structure`. Version: `1.0.0`.
- Every rule file needs frontmatter with `title` and `impact`; a rule missing either is **silently skipped** by the build.
- `impact` must be one of: `CRITICAL`, `HIGH`, `MEDIUM-HIGH`, `MEDIUM`, `LOW-MEDIUM`.
- A rule's filename prefix must match a prefix declared in `rules/_sections.md`, else it is **skipped**. Prefixes: `struct-`, `module-`, `service-`, `resolver-`, `type-`, `data-`, `relations-`, `infra-`, `conventions-`.
- `SKILL.md` must contain both marker pairs exactly: `<!-- GENERATED:START:sections -->`/`<!-- GENERATED:END:sections -->` and `<!-- GENERATED:START:rules -->`/`<!-- GENERATED:END:rules -->`. Missing pairs = hard build error.
- Build command (run from `scripts/`): `npm run build`. Read the output — it prints `warning: skipped <file>` for any rule it dropped.
- Commit source changes **and** regenerated outputs (`AGENTS.md` + `SKILL.md`) together.
- No security/DI-internals/perf/error-handling/microservices/DevOps rules — those stay in `nestjs-best-practices`. Structural overlaps cross-reference it.
- Rules are ordered alphabetically by filename within a section by the generator; do not hardcode rule numbers.

## Review Focus

Inputs/conditions the spec implies but no step's check exercises, most likely to bite first:

1. **A rule file whose prefix is misspelled or has no matching section** — the build silently skips it, so it never reaches `AGENTS.md` or the quick reference. Each task's build step must scan the output for `skipped`.
2. **A rule file missing `impact` (or with a bad value)** — silently skipped. Verify each file's frontmatter before building.
3. **A missing/typo'd `GENERATED` marker pair in `SKILL.md`** — the build hard-errors for this skill. Verify markers on scaffold (Task 1).
4. **Rule filenames that collide or duplicate a title within a section** — quick reference shows duplicates. Keep filenames unique.
5. **Stale generated output** — `AGENTS.md`/`SKILL.md` edited by hand or committed before the final build. Only edit `rules/`; always rebuild before committing.

---

### Task 1: Scaffold the skill + base structure rule

**Files:**
- Create: `skills/nestjs-graphql-structure/metadata.json`
- Create: `skills/nestjs-graphql-structure/rules/_sections.md`
- Create: `skills/nestjs-graphql-structure/rules/_template.md`
- Create: `skills/nestjs-graphql-structure/SKILL.md`
- Create: `skills/nestjs-graphql-structure/rules/struct-canonical-layout.md`
- Generated: `skills/nestjs-graphql-structure/AGENTS.md` (by build)

**Interfaces:**
- Produces: the 9 section prefixes; the SKILL.md marker pairs; `metadata.json` fields (title, version, organization, date, abstract, references). Tasks 2–6 add rule files that rely on these prefixes existing.

- [ ] **Step 1: Create `rules/_sections.md`**

Nine sections, in this order, exactly in the generator's heading format `## N. Name (prefix)` followed by `**Impact:**` and `**Description:**` lines:

```
## 1. Application Structure (struct-)
**Impact:** CRITICAL
## 2. Modules & Bootstrap (module-)
**Impact:** CRITICAL
## 3. Services (service-)
**Impact:** HIGH
## 4. GraphQL Resolvers (resolver-)
**Impact:** HIGH
## 5. GraphQL Types & Inputs (type-)
**Impact:** HIGH
## 6. Data Access (data-)
**Impact:** MEDIUM-HIGH
## 7. Relations & Cross-Module (relations-)
**Impact:** CRITICAL
## 8. Config, Common & Infra (infra-)
**Impact:** MEDIUM
## 9. Conventions & Testing (conventions-)
**Impact:** MEDIUM
```

Write a one-line `**Description:**` under each. Add a header comment noting section 2 and 7 host module-resolution rules (spec §2.1).

- [ ] **Step 2: Create `rules/_template.md`**

Frontmatter skeleton (`title`, `impact`, optional `impactDescription`, `tags`) plus the per-file rule body shape: Purpose → Placement → Responsibilities → Anti-responsibilities → Incorrect (with explanation) → Correct (with explanation) → Reference.

- [ ] **Step 3: Create `metadata.json`**

Copy the JSON object verbatim from spec §10 (title `NestJS GraphQL Application Structure`, version `1.0.0`, organization `NestJS GraphQL Structure`, date `October 2026`, the abstract, and the 8 `references`).

- [ ] **Step 4: Create `SKILL.md`**

Frontmatter: `name: nestjs-graphql-structure`; a `description` that triggers on file placement/structure/organization/cross-module relation-resolution tasks and states it is not the behavioral best-practices skill; `license: MIT`; `metadata.author` and `metadata.version: "1.0.0"`. Body: intro; **When to Apply**; a **priority table** between the `sections` markers; a **Quick Reference** between the `rules` markers; **How to Use**; **Full Compiled Document** → `./AGENTS.md`; an index note that the skill covers both structure rules and module-resolution rules (spec §2.1). Seed the two marker regions with placeholder content so the build can replace them.

- [ ] **Step 5: Create `rules/struct-canonical-layout.md`** (the base map)

Frontmatter: `title: Canonical Application Structure`, `impact: CRITICAL`, `tags: structure, layout, directory, placement`. Body: 2–3 sentences of purpose, then the full annotated tree from spec §7 (`src/` tree + full feature-module tree with a one-line purpose per file) as a fenced block. Lean map only — no good/bad snippets (spec §3). Reference the NestJS modules + GraphQL resolvers docs.

- [ ] **Step 6: Build**

Run from `scripts/`: `npm run build`.
Expected: output lists `nestjs-graphql-structure: 1 rules` (with `nestjs-best-practices: 40 rules`), and **no** `warning: skipped` lines.

- [ ] **Step 7: Verify generated output**

Confirm `skills/nestjs-graphql-structure/AGENTS.md` exists and contains the tree; confirm `SKILL.md`'s two marker sections now contain the priority table and the one-item quick reference (`- \`struct-canonical-layout\` - Canonical Application Structure`).

- [ ] **Step 8: Commit**

```bash
git add skills/nestjs-graphql-structure
git commit -m "feat(nestjs-graphql-structure): scaffold skill and base structure rule"
```

---

### Task 2: Core file rules (first deliverable)

**Files:**
- Create: `skills/nestjs-graphql-structure/rules/service-single-responsibility.md`
- Create: `skills/nestjs-graphql-structure/rules/type-inputs.md`
- Create: `skills/nestjs-graphql-structure/rules/data-entity-mongodb.md`
- Create: `skills/nestjs-graphql-structure/rules/resolver-organization.md`
- Generated: `AGENTS.md`, `SKILL.md`

**Interfaces:**
- Consumes: section prefixes from Task 1; the `_template.md` body shape.
- Produces: four rules in sections `service-`, `type-`, `data-`, `resolver-`.

- [ ] **Step 1: Create `service-single-responsibility.md`**

Frontmatter: `title: Multiple Focused Services per Module`, `impact: HIGH`, `impactDescription: split by responsibility; a module usually has several services`, `tags: services, responsibility, organization`. Body follows `_template.md`. Incorrect: one god `UsersService` mixing query/auth/media/email/reporting. Correct: `services/users.service.ts` + `services/users-profile.service.ts`, no GraphQL/HTTP decorators in a service. Placement: `services/`.

- [ ] **Step 2: Create `type-inputs.md`**

Frontmatter: `title: Define GraphQL Inputs in dto/`, `impact: HIGH`, `tags: graphql, input, dto, validation`. Incorrect: entity reused as input, no validation, raw `@Args('email')` scalars. Correct: `dto/create-user.input.ts` `@InputType` + `class-validator`, `dto/update-user.input.ts extends PartialType(CreateUserInput)`. Placement: `dto/`.

- [ ] **Step 3: Create `data-entity-mongodb.md`**

Frontmatter: `title: Place MongoDB Entities in entities/`, `impact: MEDIUM-HIGH`, `tags: mongodb, mongoose, entity, objecttype`. Incorrect: entity in a global `src/entities/` folder; `@Field()` on `password`/`passwordHash`; no index on a unique lookup column. Correct: `entities/user.entity.ts` with `@ObjectType()` + `@Schema({ timestamps: true })`, `@Prop` per field, `@Field()` only on safe fields, `select: false` + no `@Field` on secrets, index on `email`, `SchemaFactory.createForClass`. Add a one-line pointer to the `models/`+`mappers/` split variant (full rule in Task 3). Reference the NestJS MongoDB + GraphQL docs.

- [ ] **Step 4: Create `resolver-organization.md`**

Frontmatter: `title: Split Resolvers by Role into resolvers/`, `impact: HIGH`, `tags: graphql, resolver, organization`. Incorrect: one `AppResolver` holding all queries plus business logic and direct model access. Correct: `resolvers/users.query.resolver.ts`, `users.mutation.resolver.ts`, `users.field.resolver.ts`, each `@Resolver(() => User)`, thin, delegating to `UsersService`.

- [ ] **Step 5: Build**

Run `npm run build` from `scripts/`. Expected: `nestjs-graphql-structure: 5 rules`, no `skipped` warnings.

- [ ] **Step 6: Verify output**

Confirm each new rule appears in `AGENTS.md` under its section and in the `SKILL.md` quick reference (sections 3,4,5,6 each populated).

- [ ] **Step 7: Commit**

```bash
git add skills/nestjs-graphql-structure
git commit -m "feat(nestjs-graphql-structure): add core service, input, entity, resolver rules"
```

---

### Task 3: Remaining module files

**Files:** Create `rules/module-feature-module.md`, `rules/data-repository.md`, `rules/data-models-mappers.md`, `rules/type-args.md`; regenerate outputs.

**Interfaces:** Consumes Task 1 prefixes and Task 2 conventions (e.g. `data-entity-mongodb` points here for the split variant).

- [ ] **Step 1: Create `module-feature-module.md`** — `title: The Feature Module File`, `impact: CRITICAL`, `tags: modules, providers, encapsulation`. Incorrect: registering everything in `AppModule`; exporting every provider. Correct: `users.module.ts` lists only its providers/imports/exports; exports only what other modules inject.

- [ ] **Step 2: Create `data-repository.md`** — `title: Keep Data Access in repositories/`, `impact: MEDIUM-HIGH`, `tags: repository, data-access`. Incorrect: query logic + ORM calls inside a service/resolver. Correct: `repositories/users.repository.ts` wraps the model; services depend on the repository.

- [ ] **Step 3: Create `data-models-mappers.md`** — `title: Split models/ and mappers/ When API Differs From Storage`, `impact: MEDIUM-HIGH`, `tags: models, mappers, objecttype, mongodb`. Correct: GraphQL-only `models/user.model.ts`, `mappers/user.mapper.ts` (incl. `_id` → `id`); the default merged entity from `data-entity-mongodb` stays for 1:1 shapes.

- [ ] **Step 4: Create `type-args.md`** — `title: Define @Args Classes in dto/`, `impact: HIGH`, `tags: graphql, args, dto`. Incorrect: many raw `@Args('x')` scalars. Correct: `dto/find-users.args.ts` `@ArgsType()` class (pagination/filter), validated.

- [ ] **Step 5: Build** — `npm run build`; expect `9 rules`, no `skipped`.

- [ ] **Step 6: Verify output** — sections 2 and 6 populated; quick reference lists all four.

- [ ] **Step 7: Commit** — `git commit -m "feat(nestjs-graphql-structure): add module, repository, mappers, args rules"`.

---

### Task 4: Relations (incl. module-resolution rules)

**Files:** Create `rules/relations-field-resolvers.md`, `rules/relations-dataloader.md`, `rules/relations-cross-module-service.md`, `rules/relations-events.md`, `rules/relations-avoid-circular.md`; regenerate outputs.

**Interfaces:** Consumes Task 1 prefixes; `relations-` section also hosts module-resolution rules (spec §2.1).

- [ ] **Step 1: Create `relations-field-resolvers.md`** — `title: Resolve Relations with @ResolveField`, `impact: CRITICAL`, `tags: graphql, resolvefield, relations`. Incorrect: eager-loading every relation in every query. Correct: `@ResolveField` + `@Parent` resolving the field on demand.

- [ ] **Step 2: Create `relations-dataloader.md`** — `title: Batch Relations with a Per-Request DataLoader`, `impact: CRITICAL`, `tags: dataloader, n+1, loaders`. Incorrect: per-parent queries in a field resolver (N+1); singleton loader leaking cache across requests. Correct: `loaders/users.loader.ts` `DataLoader` keyed on parent id, created per request and exposed via context.

- [ ] **Step 3: Create `relations-cross-module-service.md`** — `title: Resolve Cross-Module Fields via the Owning Service`, `impact: CRITICAL`, `tags: modules, relations, services`. Incorrect: reaching into another module's repository/entity. Correct: import the owning module, inject its **exported** service/loader in the field resolver.

- [ ] **Step 4: Create `relations-events.md`** — `title: Decouple Modules with Events`, `impact: HIGH`, `tags: events, decoupling`. Correct: `events/user-created.event.ts` + listener; emit rather than call many modules directly; pointer to the DI/injection-token pattern for cross-module contracts when events don't fit.

- [ ] **Step 5: Create `relations-avoid-circular.md`** (module-resolution rule) — `title: Resolve Circular Module Dependencies`, `impact: CRITICAL`, `tags: circular-dependency, modules, forwardRef`. Incorrect: two feature modules importing each other. Correct: extract a shared module, use events, or inject a token; `forwardRef` only as last resort. Reference the NestJS circular-dependency doc.

- [ ] **Step 6: Build** — `npm run build`; expect `14 rules`, no `skipped`.

- [ ] **Step 7: Verify output** — section 7 populated with all five.

- [ ] **Step 8: Commit** — `git commit -m "feat(nestjs-graphql-structure): add relations and module-resolution rules"`.

---

### Task 5: App-level files

**Files:** Create `rules/module-bootstrap.md`, `rules/infra-config.md`, `rules/infra-common.md`, `rules/infra-graphql.md`, `rules/infra-database.md`, `rules/struct-schema-artifact.md`; regenerate outputs.

**Interfaces:** Consumes Task 1 prefixes.

- [ ] **Step 1: Create `module-bootstrap.md`** — `title: Keep main.ts and app.module.ts Thin`, `impact: CRITICAL`, `tags: bootstrap, appmodule, composition`. Incorrect: business logic / many feature registrations inline in `main.ts`; a 40-import `app.module.ts` with no grouping. Correct: `main.ts` bootstraps + registers global pipes/filters; `app.module.ts` imports feature + infra modules only.

- [ ] **Step 2: Create `infra-config.md`** — `title: Put Typed Configuration in config/`, `impact: MEDIUM`, `tags: config, env, validation`. Incorrect: `process.env.X` scattered. Correct: `config/app.config.ts` `registerAs`, `config/validation.schema.ts`, imported once, global.

- [ ] **Step 3: Create `infra-common.md`** — `title: Put Shared Building Blocks in common/`, `impact: MEDIUM`, `tags: common, guards, filters, scalars`. Incorrect: a `@CurrentUser` decorator duplicated per feature. Correct: `common/decorators`, `common/filters`, `common/guards`, `common/interceptors`, `common/pipes`, `common/scalars`.

- [ ] **Step 4: Create `infra-graphql.md`** — `title: Put GraphQL Setup in infra/graphql/`, `impact: MEDIUM`, `tags: graphql, context, dataloader`. Incorrect: `GraphQLModule.forRoot` scattered / context built ad hoc. Correct: `infra/graphql/graphql.module.ts` (`forRootAsync`, `autoSchemaFile`) + `infra/graphql/graphql.context.ts` (per-request user + loaders).

- [ ] **Step 5: Create `infra-database.md`** — `title: Put Database Setup and Migrations in infra/database/`, `impact: MEDIUM`, `tags: database, migrations, mongodb`. Incorrect: migrations dumped at repo root; DB config in feature modules. Correct: `infra/database/database.module.ts`, `database.providers.ts`, `migrations/`.

- [ ] **Step 6: Create `struct-schema-artifact.md`** — `title: Locate and Policy the Generated Schema Artifact`, `impact: MEDIUM`, `tags: schema, sdl, autoschemafile`. Incorrect: committing a hand-maintained `schema.gql`. Correct: generated from `autoSchemaFile`, location documented, committed or ignored by team policy.

- [ ] **Step 7: Build** — `npm run build`; expect `20 rules`, no `skipped`.

- [ ] **Step 8: Verify output** — sections 2, 8, 1 populated; quick reference updated.

- [ ] **Step 9: Commit** — `git commit -m "feat(nestjs-graphql-structure): add app-level structure rules"`.

---

### Task 6: Conventions & placement table

**Files:** Create `rules/conventions-naming.md`, `rules/conventions-testing.md`, `rules/conventions-cli-generator.md`, `rules/struct-file-placement-table.md`; regenerate outputs.

**Interfaces:** Consumes Task 1 prefixes.

- [ ] **Step 1: Create `conventions-naming.md`** — `title: File and Class Naming Conventions`, `impact: MEDIUM`, `tags: naming, conventions`. Correct: `<feature>.query.resolver.ts`, `<feature>.service.ts`, `create-<feature>.input.ts`, `<feature>.entity.ts`, `<feature>.loader.ts`; classes `PascalCase`.

- [ ] **Step 2: Create `conventions-testing.md`** — `title: Test File Placement`, `impact: MEDIUM`, `tags: testing, e2e, spec`. Incorrect: tests in a technical `tests/` layer. Correct: unit `<name>.spec.ts` co-located; e2e under `test/`.

- [ ] **Step 3: Create `conventions-cli-generator.md`** — `title: Use the Nest CLI Generator, Then Adjust`, `impact: MEDIUM`, `tags: cli, generator, schematics`. Correct: `nest g resource <feature>` then move files into the canonical folders; enable the `@nestjs/graphql` CLI plugin in `nest-cli.json`.

- [ ] **Step 4: Create `struct-file-placement-table.md`** — `title: File Placement Table`, `impact: HIGH`, `tags: placement, table, structure`. Body: the lookup table from spec §8 (file kind → location). Reference the base rule.

- [ ] **Step 5: Build** — `npm run build`; expect `24 rules`, no `skipped`.

- [ ] **Step 6: Verify output** — sections 9 and 1 populated; quick reference updated.

- [ ] **Step 7: Commit** — `git commit -m "feat(nestjs-graphql-structure): add conventions and placement table rules"`.

---

### Task 7: Final verification

**Files:** none new (fixes only if the checks fail).

- [ ] **Step 1: Clean build** — from `scripts/`, `npm run build`. Expected: `nestjs-graphql-structure: 24 rules`, `nestjs-best-practices: 40 rules`, zero `skipped` warnings, exit code 0.

- [ ] **Step 2: Coverage check** — compare the file kinds in `struct-canonical-layout` against the rule set. Confirm every placed file kind has a matching rule, or is explicitly noted as a later gap.

- [ ] **Step 3: Consistency check** — confirm the `SKILL.md` priority table lists all 9 sections and the quick reference lists all 24 rules with correct sections; confirm `metadata.json` version matches the SKILL.md frontmatter version.

- [ ] **Step 4: Boundary check** — confirm no rule duplicates a `nestjs-best-practices` behavioral rule and structural overlaps cross-reference it; confirm the index note about module-resolution rules is present.

- [ ] **Step 5: Commit any fixes** — `git commit -m "chore(nestjs-graphql-structure): final verification fixes"` (skip if the tree is clean).
