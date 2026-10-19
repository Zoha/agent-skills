# Agent Skills

A structured repository of agent skills (rule-based coding guidelines) with a build generator.

## Included Skills

| Skill | What it covers |
|-------|----------------|
| `nestjs-best-practices` | Framework behaviour: architecture, DI, error handling, security, performance, testing, microservices, DevOps. |
| `nestjs-graphql-structure` | File placement and anatomy for a feature-first, code-first GraphQL app, plus module-resolution rules. |
| `nestjs-elasticsearch` | Elasticsearch-backed search: index ownership, sync and reindex, ID-only queries with MongoDB hydration, cursor pagination, the optional-backend seam. |
| `nestjs-graphql-swr-caching` | Stale-while-revalidate caching of GraphQL reads: module wiring, the five knobs, leak safety, tag invalidation, observability, driver reality. |
| `nestjs-graphql-rate-limiting` | Layered GraphQL demand control: per-operation and cost-based limits, depth/complexity ceilings, per-field budgets, decorators, real client IP behind Cloudflare and other proxies, edge/Workers enforcement, GraphQL error/header contract, and deterministic testing. |

Every skill except `nestjs-best-practices` cross-references it for behavioural depth; the GraphQL skills cross-reference each other for structure, caching and demand control.

## Structure

```
scripts/            # build generator (TypeScript, tsx)
skills/             # one folder per skill
  <skill-name>/
    SKILL.md        # skill entry point (hand-written prose + GENERATED marker sections)
    metadata.json   # title, version, organization, date, abstract, references
    AGENTS.md       # GENERATED compiled rules document (committed)
    rules/
      _sections.md  # section definitions: order, name, prefix, impact
      _template.md  # template for new rules
      *.md          # rule files (prefix-description.md)
```

## Quick Start

```bash
cd scripts
npm install
npm run typecheck
npm run build
npm test
```

The generator discovers every skill under `skills/`, compiles its rules, and writes
`skills/<name>/AGENTS.md` plus the `GENERATED` marker sections of `skills/<name>/SKILL.md`.

`npm run typecheck` runs `tsc --noEmit` over the generator and its tests (`strict`, plus unused
locals/parameters). `npm test` runs the guards that keep the generated output honest: a fresh build
must match the committed `AGENTS.md`/`SKILL.md` byte for byte, every rule reference must resolve,
and every rule file must survive the build (no silent skips). CI runs `npm ci`, `npm run typecheck`,
`npm run build`, a `git status` drift check, and `npm test` on every push and pull request, so
rebuild before you commit.

## Adding a Rule

1. Copy `rules/_template.md` to `rules/<prefix>-<description>.md`.
2. Pick the prefix from `rules/_sections.md` (e.g. `arch-`, `security-`).
3. Fill in the frontmatter (`title`, `impact`, optional `impactDescription`, `tags`) and content.
4. Run `npm run build` — the rule appears in `AGENTS.md` and `SKILL.md` automatically.

## Adding a Skill

1. Create `skills/<name>/` with:
   - `SKILL.md` — hand-written prose; wrap the priority table and quick reference in
     `<!-- GENERATED:START:sections -->` / `<!-- GENERATED:END:sections -->` and
     `<!-- GENERATED:START:rules -->` / `<!-- GENERATED:END:rules -->` markers
   - `metadata.json` — see `skills/nestjs-best-practices/metadata.json`
   - `rules/_sections.md`, `rules/_template.md`, and your rule files
2. Run `npm run build`.

## Installing a Skill

```bash
npx skills add <path-or-git-url-to-this-repo>
```

Each skill folder is self-contained: `SKILL.md` + `rules/` travel with the install.
The root `AGENTS.md` is this repo's own agent instructions — it does not travel.

## Agents

When working in this repo, read [AGENTS.md](./AGENTS.md) first — it defines the
repo workflow (what is generated, what to edit, how to build).
