# Agent Skills Generator — Design Spec

**Date:** 2026-10-11
**Status:** Approved (design), pending implementation plan

## 1. Overview & Goals

This repo is a structured collection of agent skills (rule-based coding guidelines). A build generator compiles individual rule files into per-skill output documents so that **nothing consumed at install time can go stale**.

Goals:

- Port the generator concept from `Kadajett/agent-nestjs-skills` (parse rule files → emit a compiled document).
- Support **multiple skills**: any folder under `skills/` is discovered automatically; adding a skill never requires generator code changes.
- The file that travels with `npx skills add` — `SKILL.md` — is **generated** (its rule-derived sections), not hand-maintained.
- Sections/categories come from **data** (`rules/_sections.md`), not hardcoded in TypeScript.
- Keep the reference workflow: `cd scripts && npm install && npm run build`.

Non-goals:

- No documentation website (the reference keeps that on a separate `docs` branch).
- No CI workflow port (`.github/workflows` in the reference is out of scope for now).
- No publish/package pipeline (`npx skills add` installs from the git repo directly).

## 2. Repository Layout

```
agent-skills/
├── scripts/
│   ├── build-agents.ts        # the generator (TypeScript)
│   ├── build.sh               # bash wrapper: npx tsx build-agents.ts
│   ├── package.json           # build + build:watch scripts
│   └── tsconfig.json
├── skills/
│   └── nestjs-best-practices/ # ← renamed from nestjs-graphql
│       ├── SKILL.md           # hand-written prose + GENERATED marker sections
│       ├── metadata.json      # per-skill: title, version, organization, date, abstract, references
│       ├── AGENTS.md          # GENERATED (committed to git)
│       └── rules/
│           ├── _sections.md   # section definitions (parsed as category source of truth)
│           ├── _template.md   # sample for creating new rules
│           └── *.md           # rule files (area-description.md)
├── .gitignore                 # node_modules/
├── AGENTS.md                  # hand-written repo workflow (what agents read in this repo)
└── README.md                  # usage: build, add rule, add skill, install
```

## 3. Data Formats

### 3.1 Rule file frontmatter

```yaml
---
title: Avoid Circular Dependencies
impact: CRITICAL
impactDescription: "#1 cause of runtime crashes"
tags: architecture, modules, dependencies
---
```

- `title` (string, required) — used for TOC, numbering, quick reference.
- `impact` (string, required) — one of: `CRITICAL`, `HIGH`, `MEDIUM-HIGH`, `MEDIUM`, `LOW-MEDIUM`.
- `impactDescription` (string, optional) — shown next to impact in AGENTS.md.
- `tags` (comma-separated string, optional).
- Parser rules: line-based `key: value`; values are trimmed; surrounding `"` or `'` is stripped from values; blank keys (array-style YAML) are not supported — tags are inline comma-separated (matches existing files).

### 3.2 `rules/_sections.md`

Defines section order, name, filename prefix, and impact. Parsed with these regexes:

- Section heading: `^## (\d+)\. (.+) \(([\w-]+)\)` → number, name, prefix
- `\*\*Impact:\*\* (.+)` → section impact
- `\*\*Description:\*\* (.+)` → section description

Existing file format is already compatible (10 sections, prefixes `arch-`, `di-`, `error-`, `security-`, `perf-`, `test-`, `db-`, `api-`, `micro-`, `devops-`).

### 3.3 `metadata.json` (per skill)

```json
{
  "title": "NestJS Best Practices",
  "version": "1.2.0",
  "organization": "NestJS Best Practices",
  "date": "October 2026",
  "abstract": "…",
  "references": [
    "https://docs.nestjs.com",
    "…"
  ]
}
```

- `title` — H1 of AGENTS.md (replaces the hardcoded title in the reference generator).
- `version` — synced into SKILL.md frontmatter on build.
- `organization`, `date` — shown under the AGENTS.md title.
- `abstract` — AGENTS.md abstract section.
- `references` — AGENTS.md references footer.

## 4. Generator Behavior

`scripts/build-agents.ts`:

1. **Discover skills**: every direct child of `skills/` that contains a `rules/` directory and a `SKILL.md` is a skill. Others are ignored with an info log.
2. **Per skill**:
   a. Read `metadata.json`.
   b. Parse `rules/_sections.md` → ordered sections (number, name, prefix, impact, description).
   c. Read `rules/*.md`, skipping files starting with `_`.
   d. Parse frontmatter (§3.1). Missing frontmatter → warn + skip file.
   e. Match filename prefix against sections. Unknown prefix → warn + skip file.
   f. Sort rules alphabetically by filename within each section.
   g. Number rules: section `S`, rule index `R` (1-based) → `S.R` (e.g. `1.1`, `3.2`).
   h. Write `skills/<name>/AGENTS.md` (§5).
   i. Regenerate `skills/<name>/SKILL.md` marker sections + frontmatter version (§6).
3. **Summary output**: per-skill rule counts, warn/skip counts, written file paths.

### Validation & error handling (fail loud where staleness would result)

- SKILL.md missing `GENERATED:START/END` marker pairs → **hard error** for that skill, build continues for others (summary reports failure).
- Metadata file missing or invalid JSON → hard error for that skill.
- `_sections.md` missing/unparseable → hard error for that skill.
- Rule with no frontmatter → warning + skip (reference behavior).
- Rule with unknown prefix → warning + skip (reference behavior).
- Section with zero rules → omitted from output (reference behavior).
- Exit code 0 if all skills succeeded, 1 otherwise.

## 5. Output 1: `AGENTS.md` (per skill)

```markdown
# <title from metadata>

**Version <version>**
<organization>
<date>

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in `rules/` — edit those, not this file.

---

## Abstract

<metadata.abstract>

---

## Table of Contents

1. [Architecture](#1-architecture) — **CRITICAL**
   - 1.1 [Avoid Circular Dependencies](#11-avoid-circular-dependencies)
   - 1.2 […](#12-…)

---

## 1. Architecture

**Section Impact: CRITICAL**

### 1.1 Avoid Circular Dependencies

**Impact: CRITICAL** — #1 cause of runtime crashes

<rule body with the first heading line and the **Impact:** line stripped>

---

(repeat per section)

## References

- <metadata.references[0]>
- …

---

*Generated by build-agents.ts on YYYY-MM-DD*
```

Anchor scheme (unchanged from reference):
- Section: `#<section>-<name lowercased, non-alphanumerics → ->` (e.g. `#1-architecture`).
- Rule: `#<section><ruleIndex>-<title lowercased, non-alphanumerics → ->` (e.g. `#11-avoid-circular-dependencies`).

## 6. Output 2: `SKILL.md` regeneration

SKILL.md keeps hand-written prose. Only marker-delimited regions and the frontmatter `version` are touched:

- Frontmatter: the `version:` line is rewritten from `metadata.json` (only within the leading `---` block).
- Marker pairs (HTML comments, exact strings):
  - `<!-- GENERATED:START:sections -->` … `<!-- GENERATED:END:sections -->` → the `## Rule Categories by Priority` table:

    ```markdown
    | Priority | Category | Impact | Prefix |
    |----------|----------|--------|--------|
    | 1 | Architecture | CRITICAL | `arch-` |
    ```

  - `<!-- GENERATED:START:rules -->` … `<!-- GENERATED:END:rules -->` → the `## Quick Reference` list:

    ```markdown
    ### 1. Architecture (CRITICAL)

    - `arch-avoid-circular-deps` - Avoid Circular Dependencies
    ```

    The description after the dash is the rule's frontmatter `title` as-is (deterministic; the reference hand-wrote sentence-case descriptions — using the title verbatim is the staleness-free choice).

Everything else (skill description, "When to Apply", "How to Use", "Full Compiled Document" pointing at `./AGENTS.md`) remains hand-written.

## 7. Build Tooling (`scripts/`)

`package.json`:

```json
{
  "name": "agent-skills-scripts",
  "version": "1.0.0",
  "type": "module",
  "description": "Build scripts for the agent-skills repo",
  "scripts": {
    "build": "tsx build-agents.ts",
    "build:watch": "tsx watch build-agents.ts"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

- `tsx` replaces the reference's `ts-node`: zero-config ESM (the generator uses `import.meta`), works on Windows, single dependency. The `npm run build` workflow is identical to the reference.
- `typescript` is included for editor/type-checking support only.
- `tsconfig.json`: `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`, `strict: true`, `skipLibCheck: true`.

`build.sh` (reference-compatible):

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
npx tsx build-agents.ts
```

## 8. Repo documentation (root)

**README.md** — for humans: what the repo is, structure overview, quick start (`cd scripts && npm install && npm run build`), how to add a rule (copy `_template.md`, pick prefix from `_sections.md`, run build), how to add a skill (folder + SKILL.md with markers + `metadata.json` + `rules/_sections.md`), and install instructions (`npx skills add <owner>/agent-skills`).

**AGENTS.md** — hand-written (NOT generated; repo-only, does not travel with installed skills): what agents read when working in this repo. Contains:

- What this repo is and its structure (skills under `skills/<name>/`, each self-contained)
- Generated-file policy: `skills/<name>/AGENTS.md` and the `GENERATED` marker sections of `SKILL.md` are build outputs — edit sources in `rules/`, never generated files
- Build workflow: after any rule change, run `cd scripts && npm run build`, then commit both the rule changes and the regenerated outputs
- How to add a rule (copy `rules/_template.md`, prefix from `rules/_sections.md`, run build)
- How to add a skill (folder + `SKILL.md` with markers + `metadata.json` + `rules/_sections.md` + `rules/_template.md`)

## 9. Migration steps (implementation)

1. Rename `nestjs-graphql/` → `skills/nestjs-best-practices/`.
2. Move reference root `metadata.json` content into `skills/nestjs-best-practices/metadata.json` (add `title` field).
3. Update `SKILL.md`: wrap the priority table and quick reference in GENERATED markers; repoint "Full Compiled Document" to `./AGENTS.md`.
4. Add `scripts/` (build-agents.ts, build.sh, package.json, tsconfig.json), `.gitignore`, `README.md`.
5. Run `npm install && npm run build`; verify `AGENTS.md` + `SKILL.md` regenerate correctly.

## 10. Extensibility (future skills / rules)

- **New rule**: copy `_template.md` → `<prefix>-<description>.md` using a prefix from `_sections.md`, run `npm run build`.
- **New section**: add a `## N. Name (prefix)` entry to `_sections.md`; it appears in all outputs with zero code changes.
- **New skill**: create `skills/<name>/` with `SKILL.md` (with markers), `metadata.json`, `rules/_sections.md`, `rules/_template.md`; run `npm run build`.
