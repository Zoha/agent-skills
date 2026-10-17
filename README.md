# Agent Skills

A structured repository of agent skills (rule-based coding guidelines) with a build generator.

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
npm run build
npm test
```

The generator discovers every skill under `skills/`, compiles its rules, and writes
`skills/<name>/AGENTS.md` plus the `GENERATED` marker sections of `skills/<name>/SKILL.md`.

`npm test` runs the guards that keep the generated output honest: a fresh build must match the
committed `AGENTS.md`/`SKILL.md` byte for byte, every rule reference must resolve, and every rule
file must survive the build (no silent skips). CI runs `npm ci`, `npm run build`, a
`git status` drift check, and `npm test` on every push and pull request, so rebuild before you
commit.

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
