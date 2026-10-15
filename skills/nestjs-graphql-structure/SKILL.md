---
name: nestjs-graphql-structure
description: Application structure and file-placement guide for NestJS GraphQL (code-first) applications. Use when deciding where a file belongs, designing or reviewing a feature-first directory layout, scaffolding a new feature module, or working out how modules connect to resolve GraphQL fields and relations. Covers the base structure map plus per-file rules for modules, services, resolvers, inputs, entities, repositories, loaders, and events — and module-resolution concerns such as circular dependencies. For behavioral rules (DI depth, security, performance, error handling) use the nestjs-best-practices skill instead.
license: MIT
metadata:
  author: Zoha
  version: "1.0.0"
---

# NestJS GraphQL Structure

Where every file belongs in a NestJS GraphQL (code-first) application, and how each file works. This skill is a **placement and anatomy** guide: it answers "which folder does this file go in?", "what is this file responsible for?", and "how do modules connect to resolve fields and relations?". It covers the base structure map plus per-file rules for services, resolvers, inputs, entities, repositories, loaders, and events.

It is deliberately separate from the `nestjs-best-practices` skill. That skill covers framework behavior (dependency-injection depth, security, performance, error handling, microservices, DevOps); this one covers structure and module composition. Where they overlap (feature modules, circular dependencies), this skill looks at it through a placement lens and cross-references the other skill for behavioral depth.

This skill covers **both** structure rules (where a file lives) **and module-resolution rules** (how modules connect at runtime — e.g. circular-dependency resolution). Module-resolution rules live in Sections 2 and 7.

## When to Apply

Reference these guidelines when:

- Deciding where a new file belongs in a NestJS GraphQL codebase
- Designing or reviewing a feature-first directory layout
- Scaffolding a new feature module and its files
- Working out how a module resolves a field or relation that lives in another module
- Resolving connection problems between modules (circular dependencies, missing exports)

## Rule Categories by Priority

<!-- GENERATED:START:sections -->
| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Application Structure | CRITICAL | `struct-` |
| 2 | Modules & Bootstrap | CRITICAL | `module-` |
| 3 | Services | HIGH | `service-` |
| 4 | GraphQL Resolvers | HIGH | `resolver-` |
| 5 | GraphQL Types & Inputs | HIGH | `type-` |
| 6 | Data Access | MEDIUM-HIGH | `data-` |
| 7 | Relations & Cross-Module | CRITICAL | `relations-` |
| 8 | Config, Common & Infra | MEDIUM | `infra-` |
| 9 | Conventions & Testing | MEDIUM | `conventions-` |
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
### 1. Application Structure (CRITICAL)

- `struct-canonical-layout` - Canonical Application Structure
- `struct-file-placement-table` - File Placement Table
- `struct-schema-artifact` - Locate and Policy the Generated Schema Artifact

### 2. Modules & Bootstrap (CRITICAL)

- `module-bootstrap` - Keep main.ts and app.module.ts Thin
- `module-export-policy` - Export Only the Feature's Public API (Its Services)
- `module-feature-module` - The Feature Module File

### 3. Services (HIGH)

- `service-single-responsibility` - Multiple Focused Services per Module
- `service-small-focused-methods` - Keep Service Methods Small and Focused

### 4. GraphQL Resolvers (HIGH)

- `resolver-organization` - Split Resolvers by Role into resolvers/

### 5. GraphQL Types & Inputs (HIGH)

- `type-args` - Define @Args Classes in dto/
- `type-inputs` - Define GraphQL Inputs in dto/

### 6. Data Access (MEDIUM-HIGH)

- `data-entity-mongodb` - Place MongoDB Entities in entities/
- `data-models-mappers` - Split models/ and mappers/ When API Differs From Storage
- `data-repository` - Keep Data Access in repositories/

### 7. Relations & Cross-Module (CRITICAL)

- `relations-avoid-circular` - Resolve Circular Module Dependencies
- `relations-cross-module-service` - Resolve Cross-Module Fields via the Owning Service
- `relations-dataloader` - Batch Relations with a Per-Request DataLoader
- `relations-events` - Decouple Modules with Events
- `relations-field-resolvers` - Resolve Relations with @ResolveField

### 8. Config, Common & Infra (MEDIUM)

- `infra-common` - Put Shared Building Blocks in common/
- `infra-config` - Put Typed Configuration in config/
- `infra-database` - Put Database Setup and Migrations in infra/database/
- `infra-graphql` - Put GraphQL Setup in infra/graphql/

### 9. Conventions & Testing (MEDIUM)

- `conventions-cli-generator` - Use the Nest CLI Generator, Then Adjust
- `conventions-constants-enums` - Keep Constants and Enums Out of Class Files
- `conventions-naming` - File and Class Naming Conventions
- `conventions-testing` - Test File Placement
<!-- GENERATED:END:rules -->

## How to Use

Start with the base structure rule, then read the rule for the specific file kind you are
working on. Rule files live under `rules/`:

```
rules/struct-canonical-layout.md
rules/_sections.md
```

Each rule file contains:

- Purpose and placement (where the file lives and how it is named)
- Responsibilities and anti-responsibilities
- An incorrect example with an explanation
- A correct example with an explanation

## Full Compiled Document

For the complete guide with all rules expanded in a single document, see
[AGENTS.md](./AGENTS.md).
