# Claude Code instructions

This repository's agent instructions live in [AGENTS.md](./AGENTS.md). Read it first: it defines
which files are generated and must not be hand-edited, and the build workflow.

## Skill routing

When a request matches a skill, invoke it via the Skill tool. When in doubt, invoke the skill.

- Code review / "check my diff" -> `/review`
- Bugs, errors, "why is this broken" -> `/investigate`
- QA or testing behaviour -> `/qa` (fixes) or `/qa-only` (report only)
- Ship / deploy / open a PR -> `/ship`
- Save or restore working context -> `/context-save` / `/context-restore`
- Turn an idea into a spec or issue -> `/spec`
