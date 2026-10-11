# Agent Skills Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into a multi-skill layout and build a generator that compiles rule files into per-skill `AGENTS.md`, keeping `SKILL.md`'s rule-derived sections in sync.

**Architecture:** A TypeScript ESM generator in `scripts/build-agents.ts` discovers every `skills/*/` folder, parses `rules/_sections.md` for category metadata and YAML-ish frontmatter from each rule file, then writes two outputs per skill: a full compiled `AGENTS.md` and a regenerated `SKILL.md` (marker-delimited sections only, hand-written prose untouched). Build tooling uses `tsx` + `node:test`.

**Tech Stack:** TypeScript 5, tsx 4, Node >= 20 (node:test), git.

**Spec:** docs/superpowers/specs/2026-10-11-agent-skills-generator-design.md

## Global Constraints

- Node >= 20 (tests run via `node --import tsx --test`)
- `scripts/package.json` has `"type": "module"`; generator uses `import.meta`
- Exact marker strings: `<!-- GENERATED:START:sections -->`, `<!-- GENERATED:END:sections -->`, `<!-- GENERATED:START:rules -->`, `<!-- GENERATED:END:rules -->`
- Anchor scheme: section `#<number>-<slug>`, rule `#<number><ruleIndex>-<slug>`; slug = lowercase, `[^a-z0-9]+` → `-`
- npm scripts: `build` (`tsx build-agents.ts`), `build:watch` (`tsx watch build-agents.ts`), `test` (`node --import tsx --test scripts/test/*.test.ts`)
- Generated `AGENTS.md` files are committed to git; only `node_modules/` is ignored
- Rule files: `rules/*.md` excluding `_`-prefixed; frontmatter keys `title` (required), `impact` (required), `impactDescription?`, `tags?` (inline comma-separated)

## Review Focus

1. Rule file missing frontmatter → warn + skip, build continues
2. Rule filename with unknown prefix → warn + skip, build continues
3. Section with zero rules → omitted from AGENTS.md + quick reference; still listed in SKILL.md sections table
4. SKILL.md missing a marker pair → hard error for that skill, other skills still build, exit code 1
5. Quoted frontmatter values (`impactDescription: "#1 cause..."`) → surrounding quotes stripped
6. Optional `impactDescription` absent → `**Impact: X**` with no trailing dash
7. Titles/sections with special chars (`&`, parentheses) → correct anchor slugs ("Database & ORM" → `database-orm`)

---

### Task 1: Repo scaffolding & migration

**Files:**
- Rename: `nestjs-graphql/` → `skills/nestjs-best-practices/`
- Create: `skills/nestjs-best-practices/metadata.json`, `.gitignore`, `README.md`
- Modify: `skills/nestjs-best-practices/SKILL.md` (add GENERATED markers, repoint compiled-doc link)

**Interfaces:** none (pure file operations)

- [ ] **Step 1: Initialize git**

Run `git init` in the repo root. Verify: `git status` works.

- [ ] **Step 2: Move the skill folder**

Run: `git mv nestjs-graphql skills/nestjs-best-practices`
Verify: `skills/nestjs-best-practices/SKILL.md` exists.

- [ ] **Step 3: Create `skills/nestjs-best-practices/metadata.json`**

Exact content:

```json
{
  "title": "NestJS Best Practices",
  "version": "1.2.0",
  "organization": "NestJS Best Practices",
  "date": "October 2026",
  "abstract": "Comprehensive best practices and architecture guide for NestJS applications, designed for AI agents and LLMs. Contains 40 rules across 10 categories, prioritized by impact from critical (architecture, dependency injection) to incremental (DevOps patterns). Each rule includes detailed explanations, real-world examples comparing incorrect vs. correct implementations, and specific impact metrics to guide automated refactoring and code generation.",
  "references": [
    "https://docs.nestjs.com",
    "https://github.com/nestjs/nest",
    "https://typeorm.io",
    "https://github.com/typestack/class-validator",
    "https://github.com/goldbergyoni/nodebestpractices"
  ]
}
```

- [ ] **Step 4: Add GENERATED markers to `SKILL.md`**

Wrap the existing `## Rule Categories by Priority` table and the entire `## Quick Reference` list so each sits between its marker pair, e.g.:

```markdown
## Rule Categories by Priority

<!-- GENERATED:START:sections -->
| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
…existing 10 rows unchanged…
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
### 1. Architecture (CRITICAL)
…existing list unchanged…
<!-- GENERATED:END:rules -->
```

Also replace the `## Full Compiled Document` section with:

```markdown
## Full Compiled Document

For the complete guide with all rules expanded in a single document, see
[AGENTS.md](./AGENTS.md).
```

Everything else in SKILL.md stays byte-identical.

- [ ] **Step 5: Create `.gitignore` and `README.md`**

`.gitignore` contains exactly:

```
node_modules/
```

`README.md` contains: what the repo is, the structure overview from spec §2, quick start (`cd scripts && npm install && npm run build`), how to add a rule (copy `_template.md`, pick prefix from `_sections.md`, run build), how to add a skill (folder + `SKILL.md` with markers + `metadata.json` + `rules/_sections.md`), and install instructions (`npx skills add`).

- [ ] **Step 6: Create root `AGENTS.md` (hand-written, repo-only)**

Content per spec §8: what the repo is + structure, generated-file policy (never edit `skills/<name>/AGENTS.md` or the SKILL.md marker sections — edit `rules/` sources), build workflow (`cd scripts && npm run build` after rule changes; commit regenerated outputs), how to add a rule, how to add a skill. State explicitly that this file is NOT generated and does not travel with installed skills.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: restructure repo for multi-skill generator"
```

---

### Task 2: Build tooling

**Files:**
- Create: `scripts/package.json`, `scripts/tsconfig.json`, `scripts/build.sh`

**Interfaces:** none

- [ ] **Step 1: Create `scripts/package.json`**

Exact content:

```json
{
  "name": "agent-skills-scripts",
  "version": "1.0.0",
  "type": "module",
  "description": "Build scripts for the agent-skills repo",
  "scripts": {
    "build": "tsx build-agents.ts",
    "build:watch": "tsx watch build-agents.ts",
    "test": "node --import tsx --test scripts/test/*.test.ts"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `scripts/tsconfig.json`**

Exact content:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Create `scripts/build.sh`**

Exact content:

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
npx tsx build-agents.ts
```

Run `chmod +x scripts/build.sh`.

- [ ] **Step 4: Install and verify toolchain**

Run: `cd scripts && npm install`
Verify: install succeeds; `node --version` is >= 20; `npx tsx --version` prints a 4.x version.

- [ ] **Step 5: Commit**

```bash
git add scripts/
git commit -m "chore: add generator build tooling"
```

---

### Task 3: Frontmatter & section parsers (TDD)

**Files:**
- Create: `scripts/test/parsers.test.ts`
- Create: `scripts/build-agents.ts` (types + parsers only — no `main()` yet, no side effects on import)

**Interfaces:**
- Produces:
  - `interface RuleFrontmatter { title: string; impact: string; impactDescription?: string; tags?: string[] }`
  - `interface Section { number: number; name: string; prefix: string; impact: string; description: string }`
  - `interface SkillMetadata { title: string; version: string; organization: string; date: string; abstract: string; references: string[] }`
  - `parseFrontmatter(content: string): { frontmatter: RuleFrontmatter | null; body: string }`
  - `parseSections(content: string): Section[]`

- [ ] **Step 1: Write the failing test**

Create `scripts/test/parsers.test.ts` using `node:test` + `node:assert/strict` with these cases:

- `parseFrontmatter` on text with frontmatter:
  ```
  ---
  title: Avoid Circular Dependencies
  impact: CRITICAL
  impactDescription: "#1 cause of runtime crashes"
  tags: architecture, modules, dependencies
  ---

  ## Avoid Circular Dependencies

  body text
  ```
  Asserts: `frontmatter.title === "Avoid Circular Dependencies"`, `impact === "CRITICAL"`, `impactDescription === "#1 cause of runtime crashes"` (quotes stripped), `tags` deep-equals `["architecture","modules","dependencies"]`, `body === "## Avoid Circular Dependencies\n\nbody text"`.
- `parseFrontmatter` on text with only `title` + `impact` → `impactDescription`/`tags` are `undefined`.
- `parseFrontmatter` on text with no frontmatter → `frontmatter === null`, `body` === original content.
- `parseFrontmatter` on unquoted `impactDescription: some description here` → value kept verbatim.
- `parseSections` on the real file `../skills/nestjs-best-practices/rules/_sections.md` → returns 10 sections; first is `{ number: 1, name: "Architecture", prefix: "arch-", impact: "CRITICAL", description: "Proper module organization and dependency management are the foundation of maintainable NestJS applications. Circular dependencies and god services are the #1 architecture killer." }`; the section with prefix `db-` has name `"Database & ORM"` and number 7; every section has non-empty `description`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npm test`
Expected: FAIL — `../build-agents.ts` does not exist (module not found).

- [ ] **Step 3: Implement types + parsers in `scripts/build-agents.ts`**

Approach:
- `parseFrontmatter`: match `/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/`; if no match return `{ frontmatter: null, body: content }`. Parse line-based `key: value` (split on first `:`), trim value, strip one matching pair of surrounding `"` or `'`; `tags` → split on `,` + trim + drop empties.
- `parseSections`: per line — heading regex `/^## (\d+)\. (.+) \(([\w-]+)\)/` starts a new Section; `\*\*Impact:\*\* (.+)` / `\*\*Description:\*\* (.+)` attach to the most recent section.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npm test`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-agents.ts scripts/test/parsers.test.ts
git commit -m "feat: add frontmatter and section parsers"
```

---

### Task 4: AGENTS.md generation (TDD)

**Files:**
- Create: `scripts/test/agents.test.ts`
- Modify: `scripts/build-agents.ts`

**Interfaces:**
- Consumes: `RuleFrontmatter`, `Section`, `SkillMetadata` (Task 3)
- Produces:
  - `interface Rule { filename: string; frontmatter: RuleFrontmatter; content: string; section: Section; ruleNumber: string }`
  - `generateAgentsMd(rules: Rule[], metadata: SkillMetadata, sections: Section[]): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/test/agents.test.ts` building `Rule` objects inline. Cases:

- Header: output contains `# NestJS Best Practices`, `**Version 1.2.0**`, organization line, date line, the `> **Note:**` block, `## Abstract` + metadata abstract.
- TOC: contains `1. [Architecture](#1-architecture) — **CRITICAL**` and `   - 1.1 [Avoid Circular Dependencies](#11-avoid-circular-dependencies)`.
- Special-character slug: a section named `"Database & ORM"` (number 7) produces TOC entry `7. [Database & ORM](#7-database-orm)`.
- Numbering: two rules in section 1 → `### 1.1` and `### 1.2`; one rule in section 2 → `### 2.1`.
- Body stripping: rule content starting with `## Avoid Circular Dependencies\n\n**Impact: CRITICAL** — x\n\nreal body` renders as `real body` only (first heading and Impact line removed).
- Impact rendering: rule without `impactDescription` → `**Impact: HIGH**` with no trailing dash; with it → `**Impact: CRITICAL** — desc text`.
- Footer: `## References` lists all metadata references; final line matches `\*Generated by build-agents.ts on \d{4}-\d{2}-\d{2}\*`.
- Empty section: a section with no rules produces no `## <n>. <Name>` block and no TOC entry.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npm test`
Expected: FAIL — `generateAgentsMd` / `Rule` not exported (module has no such exports).

- [ ] **Step 3: Implement `generateAgentsMd` in `scripts/build-agents.ts`**

Approach (per spec §5):
- Group rules by section; iterate `sections` in order; skip sections with zero rules; sort each group by `filename`.
- `ruleNumber` = `${section.number}.${i + 1}` (also set `rule.ruleNumber` before rendering).
- Slug helper: `s.toLowerCase().replace(/[^a-z0-9]+/g, '-')`.
- Rule anchor = `${section.number}${i + 1}-${slug(title)}`.
- Rule body: strip first heading line (`/^#{1,2}\s+.*\n+/`) and Impact line (`/^\*\*Impact:.*\*\*.*\n+/`).
- `impactDescription` present → `**Impact: X** — desc`; absent → `**Impact: X**`.
- Footer: references from metadata, then generated-date line.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npm test`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-agents.ts scripts/test/agents.test.ts
git commit -m "feat: generate AGENTS.md from rules"
```

---

### Task 5: SKILL.md regeneration (TDD)

**Files:**
- Create: `scripts/test/skill-md.test.ts`
- Modify: `scripts/build-agents.ts`

**Interfaces:**
- Consumes: `Rule`, `Section`, `SkillMetadata` (Tasks 3–4)
- Produces: `regenerateSkillMd(skillMd: string, metadata: SkillMetadata, rules: Rule[], sections: Section[]): string`

- [ ] **Step 1: Write the failing test**

Create `scripts/test/skill-md.test.ts`. Fixture SKILL.md (minimal):

```markdown
---
name: test-skill
description: test
metadata:
  version: "0.0.1"
---

# Test Skill

Hand-written intro prose that must survive.

## Rule Categories by Priority

<!-- GENERATED:START:sections -->
stale table
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
stale list
<!-- GENERATED:END:rules -->

## How to Use

Hand-written usage prose that must survive.
```

Metadata: `{ title: "Test Skill", version: "9.9.9", organization: "Org", "date": "October 2026", "abstract": "abs", references: [] }`.
Sections: `#` 1 `Architecture` prefix `arch-` impact `CRITICAL`; `#` 2 `Empty` prefix `empty-` impact `LOW`.
Rules: two valid `arch-` rules (titles "Alpha Rule", "Beta Rule"), zero `empty-` rules.

Cases:
- Output contains `version: "9.9.9"` in frontmatter (was `0.0.1`).
- Between the sections markers: exact table

  ```
  | Priority | Category | Impact | Prefix |
  |----------|----------|--------|--------|
  | 1 | Architecture | CRITICAL | `arch-` |
  | 2 | Empty | LOW | `empty-` |
  ```
- Between the rules markers: `### 1. Architecture (CRITICAL)` followed by `- \`arch-alpha\` - Alpha Rule` and `- \`arch-beta\` - Beta Rule`; no `### 2. Empty` block.
- Hand-written prose (intro + How to Use) is byte-identical in output.
- Input missing the `sections` marker pair → function throws.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npm test`
Expected: FAIL — `regenerateSkillMd` not exported.

- [ ] **Step 3: Implement `regenerateSkillMd` in `scripts/build-agents.ts`**

Approach (per spec §6):
- Version sync: within the first `---\n...\n---` block only, replace the `version:` line with `version: "<metadata.version>"`.
- Marker replacement: regex `/<!-- GENERATED:START:sections -->\n[\s\S]*?\n<!-- GENERATED:END:sections -->/` → `START\n<table rows>\nEND`; same for `rules`. If a marker pair is absent → `throw new Error("SKILL.md missing GENERATED markers: <skill>")`.
- Sections table rows: `| ${number} | ${name} | ${impact} | \`${prefix}\` |` — all sections, including empty ones.
- Quick reference: sections with ≥1 rule, in section order; rules sorted by filename; `- \`<filename without .md>\` - <title>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npm test`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-agents.ts scripts/test/skill-md.test.ts
git commit -m "feat: regenerate SKILL.md generated sections"
```

---

### Task 6: Discovery, rule loading, main wiring & e2e (TDD)

**Files:**
- Create: `scripts/test/e2e.test.ts`
- Modify: `scripts/build-agents.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5
- Produces:
  - `discoverSkills(skillsRoot: string): string[]` — sorted folder names that contain both `rules/` and `SKILL.md`
  - `readMetadata(skillDir: string): SkillMetadata`
  - `readRules(skillDir: string, sections: Section[]): { rules: Rule[]; skipped: string[] }` — skips `_`-prefixed files (not reported), files with no frontmatter and files with unknown prefix (reported in `skipped`)
  - `buildSkill(skillDir: string): { ruleCount: number; skipped: string[] }` — reads metadata/sections/rules, writes `AGENTS.md`, regenerates `SKILL.md`; throws on hard errors
  - `buildAll(skillsRoot: string): { built: string[]; failed: string[] }` — per skill: success → `built`, error → log warning + `failed`
  - `main(): void` — calls `buildAll(<repo>/skills)`, prints summary, `process.exit(failed ? 1 : 0)`

- [ ] **Step 1: Write the failing e2e test**

Create `scripts/test/e2e.test.ts`. In a temp dir (`fs.mkdtempSync(os.tmpdir() + ...)`, cleaned up in `tearDown`):

Fake skill `demo/`:
- `SKILL.md` — Task 5 fixture shape with markers and `version: "0.0.1"`, plus one hand-written line
- `metadata.json` — version `"2.0.0"`, one reference
- `rules/_sections.md` — sections: `## 1. Architecture (arch-)` impact CRITICAL; `## 2. Extra (extra-)` impact LOW
- `rules/arch-alpha.md` — valid frontmatter (`title: Alpha Rule`, `impact: HIGH`) + body
- `rules/arch-beta.md` — valid frontmatter (`title: Beta Rule`, `impact: LOW`) + body
- `rules/xyz-unknown.md` — valid frontmatter, prefix not in sections
- `rules/broken.md` — no frontmatter

Also create `not-a-skill/` (no `rules/` subdir) and `broken-skill/` (has `rules/` + `SKILL.md`, but SKILL.md lacks the GENERATED markers) at the temp root.

Call `buildAll(tmpRoot)`. Asserts:
- `built` contains the demo skill dir path; `failed` contains the broken-skill dir path and buildAll does not throw (one bad skill must not abort the rest)
- `not-a-skill` is not discovered
- demo `AGENTS.md` exists; contains `### 1.1 Alpha Rule`, `### 1.2 Beta Rule`, `**Version 2.0.0**`, the reference; no `## 2. Extra` block
- demo `SKILL.md` has `version: "2.0.0"`, regenerated quick reference with both rules, hand-written line intact
- `skipped` (from `buildSkill` on demo, called directly in the test) contains `xyz-unknown.md` and `broken.md`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd scripts && npm test`
Expected: FAIL — `buildAll`/`buildSkill` not exported.

- [ ] **Step 3: Implement discovery, loading, build orchestration, `main()` in `scripts/build-agents.ts`**

Approach:
- `readRules`: read `rules/`, filter `.md` non-`_`; parse frontmatter; match prefix to a section; push valid to rules, invalid to `skipped`.
- `buildSkill`: read `metadata.json` + `_sections.md` + rules; call `generateAgentsMd`; write `AGENTS.md`; read `SKILL.md`, call `regenerateSkillMd`, write back. Warnings printed for `skipped` files.
- `main()` guarded by `if (pathToFileURL(process.argv[1] ?? '').href === fileURLToPath(import.meta.url)) main();` so tests can import the module side-effect-free. (Note: Tasks 3–5 leave the file without `main()`; `npm run build` before this task is a no-op — expected.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd scripts && npm test`
Expected: PASS (all cases).

- [ ] **Step 5: Run the real build end-to-end**

Run: `cd scripts && npm run build`
Expected: exit 0; summary shows 1 skill, 40 rules; `skills/nestjs-best-practices/AGENTS.md` created; `git diff --stat` shows `AGENTS.md` and `SKILL.md` modified.
Expected diffs in `SKILL.md`: quick-reference descriptions become the frontmatter titles verbatim (e.g. `Avoid Circular Dependencies` instead of the old sentence-case `Avoid circular module dependencies`) — this is the intended title-verbatim behavior from spec §6.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-agents.ts scripts/test/e2e.test.ts skills/nestjs-best-practices/
git commit -m "feat: wire generator main and generate skill outputs"
```
