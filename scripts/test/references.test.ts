import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reference-integrity guard.
 *
 * Rules cross-reference each other by name in inline code — `sync-full-reindex-alias-swap`,
 * `relations-owning-module` — and the build has no way to notice when one of those names is
 * renamed or misspelled. A dangling reference sends an agent looking for a rule that does not
 * exist, which is worse than no reference at all: it reads as authoritative.
 *
 * This test collects every inline-code token whose prefix matches a known section prefix (so
 * `search-reindex` and `index-one` are ignored, but `arch-base-search-repository` and
 * `relations-owning-module` are checked) and asserts each one resolves to a real rule file in
 * some skill. Cross-skill references are resolved against every skill, because that is how the
 * corpus actually links (nestjs-elasticsearch → nestjs-graphql-structure, for example).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.join(__dirname, '..', '..', 'skills');

interface Skill {
  name: string;
  prefixes: string[];
  rules: string[];
}

function readSkills(root: string): Skill[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        fs.existsSync(path.join(root, name, 'rules')) &&
        fs.existsSync(path.join(root, name, 'SKILL.md')),
    )
    .sort()
    .map((name) => {
      const rulesDir = path.join(root, name, 'rules');
      const sections = fs.readFileSync(path.join(rulesDir, '_sections.md'), 'utf-8');
      const prefixes = [...sections.matchAll(/^## \d+\. .+ \(([\w-]+)\)/gm)].map((m) => m[1]);
      const rules = fs
        .readdirSync(rulesDir)
        .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
        .map((file) => file.replace(/\.md$/, ''));
      return { name, prefixes, rules };
    });
}

/** Files whose inline code is scanned: every rule body plus the skill entry point. */
function scannedFiles(root: string, skill: Skill): string[] {
  const rulesDir = path.join(root, skill.name, 'rules');
  return [
    ...fs
      .readdirSync(rulesDir)
      .filter((file) => file.endsWith('.md') && !file.startsWith('_'))
      .map((file) => path.join(rulesDir, file)),
    path.join(root, skill.name, 'SKILL.md'),
  ];
}

/** Drop fenced blocks so only prose-level inline spans are examined. */
function stripFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

interface Reference {
  token: string;
  file: string;
}

const skills = readSkills(skillsDir);
const allPrefixes = new Set(skills.flatMap((s) => s.prefixes));
const allRules = new Set(skills.flatMap((s) => s.rules));

function collectReferences(): Reference[] {
  const found: Reference[] = [];
  for (const skill of skills) {
    for (const file of scannedFiles(skillsDir, skill)) {
      const body = stripFences(fs.readFileSync(file, 'utf-8'));
      for (const [, token] of body.matchAll(/`([^`\n]+)`/g)) {
        if (!/^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(token)) continue;
        const prefix = token.slice(0, token.indexOf('-') + 1);
        // only tokens shaped like a rule name in some section are candidates
        if (!allPrefixes.has(prefix)) continue;
        found.push({ token, file: path.relative(skillsDir, file) });
      }
    }
  }
  return found;
}

const references = collectReferences();

test('every inline rule reference resolves to a real rule file', () => {
  const unresolved = references.filter((ref) => !allRules.has(ref.token));

  const report = unresolved.map((ref) => `${ref.file}: \`${ref.token}\``).join('\n');
  assert.equal(unresolved.length, 0, `dangling rule references:\n${report}`);
});

test('the reference scan actually finds references (guards against a vacuous pass)', () => {
  // A regex regression that matched nothing would make the test above pass for the wrong reason.
  assert.ok(
    references.length >= 25,
    `expected at least 25 inline rule references, found ${references.length}`,
  );

  const crossSkill = references.filter((ref) => {
    const owner = skills.find((s) => s.rules.includes(ref.token));
    return owner && !ref.file.startsWith(owner.name);
  });
  assert.ok(
    crossSkill.length >= 5,
    `expected the corpus to reference sibling skills, found ${crossSkill.length}`,
  );
});

test('no Reference line labels an external link as a sibling rule', () => {
  // The label promises a rule path, but the URL points somewhere else — unfollowable either way.
  // Sibling rules belong in prose ("see `data-repository` in the ... skill"), not in a link label.
  const offenders: string[] = [];
  for (const skill of skills) {
    for (const file of scannedFiles(skillsDir, skill)) {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (/^Reference:.*\[(nestjs-[a-z-]+) — /.test(line)) {
          offenders.push(`${path.relative(skillsDir, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }
  assert.equal(offenders.length, 0, `mislabeled reference lines:\n${offenders.join('\n')}`);
});
