# SDD ledger — plan: docs/superpowers/plans/2026-10-11-agent-skills-generator.md

Pre-flight: no shared-interface conflicts (Tasks 3→4→5→6 consume matching signatures: RuleFrontmatter/Section/SkillMetadata → Rule/generateAgentsMd → regenerateSkillMd → buildAll/main).

Task 1: complete (commit 00f1792).
Task 1: Ruling: _sections.md section 8 was stale ("API Design (api)") vs user's current SKILL.md + rule filenames ("Cross-Cutting Concerns", use- prefix) — updated _sections.md to match user intent so the 3 use-* rules are not skipped — cost if wrong: one section entry to rename back.
Task 1: note: empty nestjs-graphql/ source dir could not be deleted (locked by external process, likely editor); all files copied; git ignores empty dirs — cosmetic.

Task 2: complete (commits 589191e, 5829c35). npm install OK; tsx v4.23.15; node v24.19.0.

Task 3: complete (commit 8eb8a35, tests: npm test → 5/5 pass).
Task 3: Ruling: plan's test path `../skills/...` was wrong — test file lives in scripts/test/, so repo root is `../../skills/...` — corrected the test path — cost if wrong: none (test path).
Task 3: Ruling: _sections.md prefixes lacked the trailing dash (`(arch)`) that rule filenames and SKILL.md use (`arch-`) — rewrote all 10 section headings to include the dash, so prefix matching works — cost if wrong: revert 10 heading lines.
Task 3: Ruling: plan's `npm test` glob `scripts/test/*.test.ts` fails on Windows (npm does not expand globs) and `--test test/` triggers ERR_UNSUPPORTED_DIR_IMPORT under tsx ESM — use quoted glob `"test/*.test.ts"` for the npm test script — cost if wrong: none (test tooling).

Task 4: complete (commit 0f0ad79, tests: npm test → 10/10 pass).

Task 5: complete (commit 7ec4368, tests: npm test → 15/15 pass).

Task 6: complete (commit d0ec331, tests: npm test → 18/18 pass; real build: 40 rules, 0 failed).
Task 6: Ruling: buildSkill computes both outputs (AGENTS.md + regenerated SKILL.md) before writing any file, so a failing skill (e.g. missing markers) leaves no partial output — deviation from the plan's "write then regenerate" order — cost if wrong: none (strictly safer).
Task 6: Ruling: real build exposed CRLF bugs the LF-only unit fixtures missed — (a) replaceMarkers regex assumed `\n`; (b) stripRuleBody failed to strip the leading rule heading on CRLF bodies and produced mixed line endings. Fixed: EOL-aware marker replacement, and stripRuleBody now normalizes CRLF→LF then strips (generated AGENTS.md is now pure LF, 0 CRLF). Added CRLF regression tests in skill-md.test.ts and agents.test.ts — cost if wrong: none.
Task 6: note: SKILL.md quick-reference descriptions now mirror the frontmatter titles verbatim (intended per spec §6; the old hand-written sentence-case descriptions were replaced).

Final review: dispatched a fresh-context reviewer subagent on 00f1792..d0ec331 (read the spec + plan, ran the suite, verified idempotency + exit codes independently). No Critical findings. Reviewer's 4 Important; re-graded by effect: #1, #2, #4 fixed; #3 re-graded Minor.
Final: fixed #1 (_sections.md parsing to zero sections now hard-errors) — test 'buildAll fails a skill whose _sections.md parses to zero sections' RED→GREEN, suite 20/20.
Final: fixed #2 (rule with no impact is now skipped + warned) — e2e fixture arch-no-impact.md RED→GREEN, suite 20/20.
Final: fixed #4 (main() exit codes) — test 'main exits 0 for a healthy tree and 1 for a broken tree' RED→GREEN, suite 20/20; main() is now exported, honors SKILLS_ROOT, and uses process.exitCode instead of process.exit.
Final: Ruling: #3 (anchor slug scheme differs from GitHub's slugger for '&' and 'N+1', so two section links and N+1 rule links don't resolve on GitHub) — re-graded Minor: the scheme is explicitly defined in the approved spec §5 and shared with the reference repo; fixing it contradicts the spec and the effect is cosmetic link navigation, not content loss — deferred and surfaced to the human — cost if wrong: TOC links for "Database & ORM" and "N+1" rules do not resolve when viewed on GitHub.
Final: minor (deferred): readMetadata does not validate required fields; spec §4.3 written-file-paths / §4.1 non-skill info log not emitted; localeCompare is locale-sensitive; version sync silently no-ops if the frontmatter has no version line; discoverSkills does not verify rules/ is a directory; replaceMarkers requires a newline before the END marker; writes are non-atomic; test glob needs Node >= 21; cosmetic blank lines when a skill has no rules/references.
Final: idempotency re-confirmed after the fix pass — `npm run build` produced no changes to AGENTS.md or SKILL.md; suite 20/20.
