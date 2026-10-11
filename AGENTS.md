# Agent Skills — Repository Instructions

This repo contains agent skills: rule-based coding guidelines organized into
self-contained skill folders under `skills/`.

## Structure

- `skills/<name>/` — one skill per folder (`SKILL.md`, `metadata.json`, `rules/`)
- `skills/<name>/rules/` — the source of truth: rule files (`*.md`), `_sections.md`, `_template.md`
- `scripts/` — the build generator
- `README.md` — human-facing documentation

## What Is Generated — Do Not Hand-Edit

These files are build outputs. Edit the sources in `rules/`, never these:

- `skills/<name>/AGENTS.md` — compiled rules document
- The `GENERATED:START/END` marker sections inside `skills/<name>/SKILL.md`
  (the priority table and the quick reference list)

## Build Workflow

After any change to a skill's rules, sections, or metadata:

```bash
cd scripts
npm run build
```

Then commit **both** the source changes and the regenerated outputs
(`AGENTS.md` + `SKILL.md` marker sections) together.

The generator warns and skips: rule files without frontmatter, and rule files
whose filename prefix has no matching section in `rules/_sections.md`. Read the
build output — do not ignore skips.

## Adding a Rule

1. Copy `skills/<name>/rules/_template.md` to `<prefix>-<description>.md`
   (prefix from `rules/_sections.md`).
2. Fill in frontmatter + content.
3. `npm run build`.

## Adding a Skill

1. Create `skills/<name>/` with `SKILL.md` (with GENERATED markers around the
   priority table and quick reference), `metadata.json`, `rules/_sections.md`,
   `rules/_template.md`.
2. `npm run build`.

## Conventions

- Rule filename: `<prefix>-<description>.md` (e.g. `security-auth-jwt.md`)
- Section inference: from filename prefix, defined in `rules/_sections.md`
- Rules sort alphabetically by filename within a section; IDs (`1.1`, `1.2`, …)
  are auto-generated — never hardcode them
- Impact levels: `CRITICAL`, `HIGH`, `MEDIUM-HIGH`, `MEDIUM`, `LOW-MEDIUM`
