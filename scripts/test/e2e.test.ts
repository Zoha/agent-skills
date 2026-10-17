import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildAll, buildSkill, parseSections, readRules } from '../build-agents.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(__dirname, '..');

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

const demoMetadata = JSON.stringify({
  title: 'Demo Skill',
  version: '2.0.0',
  organization: 'Demo Org',
  date: 'October 2026',
  abstract: 'Demo abstract.',
  references: ['https://example.com/ref'],
});

const demoSections = `# Sections

## 1. Architecture (arch-)

**Impact:** CRITICAL
**Description:** Arch desc.

## 2. Extra (extra-)

**Impact:** LOW
**Description:** Extra desc.
`;

const demoSKill = `---
name: demo
description: demo skill
metadata:
  version: "0.0.1"
---

# Demo

HAND_WRITTEN_LINE

## Rule Categories by Priority

<!-- GENERATED:START:sections -->
stale
<!-- GENERATED:END:sections -->

## Quick Reference

<!-- GENERATED:START:rules -->
stale
<!-- GENERATED:END:rules -->
`;

function rule(title: string, impact: string): string {
  return `---\ntitle: ${title}\nimpact: ${impact}\n---\n\n## ${title}\n\n**Impact: ${impact}**\n\nbody of ${title}\n`;
}

test('buildAll generates AGENTS.md + SKILL.md, skips bad rules, isolates failures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-e2e-'));
  try {
    writeFiles(root, {
      'demo/SKILL.md': demoSKill,
      'demo/metadata.json': demoMetadata,
      'demo/rules/_sections.md': demoSections,
      'demo/rules/arch-alpha.md': rule('Alpha Rule', 'HIGH'),
      'demo/rules/arch-beta.md': rule('Beta Rule', 'LOW'),
      'demo/rules/xyz-unknown.md': rule('Unknown Rule', 'MEDIUM'),
      'demo/rules/arch-no-impact.md': '---\ntitle: No Impact Rule\n---\n\n## No Impact Rule\n\nbody\n',
      'demo/rules/broken.md': 'no frontmatter here',
      'not-a-skill/README.md': 'not a skill',
      'broken-skill/SKILL.md': '# No markers here\n',
      'broken-skill/metadata.json': demoMetadata,
      'broken-skill/rules/_sections.md': demoSections,
    });

    const result = buildAll(root);
    const demoDir = path.join(root, 'demo');
    const brokenDir = path.join(root, 'broken-skill');

    assert.deepEqual(result.built, [demoDir]);
    assert.deepEqual(result.failed, [brokenDir]);
    assert.ok(![...result.built, ...result.failed].some((p) => p.includes('not-a-skill')));

    const agents = fs.readFileSync(path.join(demoDir, 'AGENTS.md'), 'utf-8');
    assert.ok(agents.includes('### 1.1 Alpha Rule'));
    assert.ok(agents.includes('### 1.2 Beta Rule'));
    assert.ok(agents.includes('**Version 2.0.0**'));
    assert.ok(agents.includes('https://example.com/ref'));
    assert.ok(!agents.includes('## 2. Extra'));

    const skill = fs.readFileSync(path.join(demoDir, 'SKILL.md'), 'utf-8');
    assert.ok(skill.includes('version: "2.0.0"'));
    assert.ok(skill.includes('- `arch-alpha` - Alpha Rule'));
    assert.ok(skill.includes('- `arch-beta` - Beta Rule'));
    assert.ok(skill.includes('HAND_WRITTEN_LINE'));

    const { ruleCount, skipped } = buildSkill(demoDir);
    assert.equal(ruleCount, 2);
    assert.deepEqual(skipped.sort(), ['arch-no-impact.md', 'broken.md', 'xyz-unknown.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('main exits 0 for a healthy tree and 1 for a broken tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-main-'));
  try {
    writeFiles(root, {
      'demo/SKILL.md': demoSKill,
      'demo/metadata.json': demoMetadata,
      'demo/rules/_sections.md': demoSections,
      'demo/rules/arch-alpha.md': rule('Alpha Rule', 'HIGH'),
    });
    const run = () =>
      spawnSync('node', ['--import', 'tsx', 'build-agents.ts'], {
        cwd: scriptsDir,
        env: { ...process.env, SKILLS_ROOT: root },
        encoding: 'utf-8',
      });

    const ok = run();
    assert.equal(ok.status, 0, ok.stderr);

    fs.writeFileSync(path.join(root, 'demo', 'SKILL.md'), '# no markers\n');
    const bad = run();
    assert.equal(bad.status, 1, bad.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('every real skill builds with zero skipped rule files', () => {
  // Read-only: parse each real skill's rules the same way the build does and assert nothing is
  // silently dropped. A rule whose filename prefix no longer matches _sections.md would otherwise
  // vanish from the shipped AGENTS.md with only a console warning.
  const root = path.join(scriptsDir, '..', 'skills');
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter(
      (dir) => fs.existsSync(path.join(dir, 'rules')) && fs.existsSync(path.join(dir, 'SKILL.md')),
    );
  assert.ok(dirs.length > 0, 'expected at least one real skill under skills/');

  for (const dir of dirs) {
    const name = path.basename(dir);
    const sections = parseSections(fs.readFileSync(path.join(dir, 'rules', '_sections.md'), 'utf-8'));
    assert.ok(sections.length > 0, `${name}: rules/_sections.md parsed to zero sections`);
    const { rules, skipped } = readRules(dir, sections);
    assert.deepEqual(skipped, [], `${name}: rule files skipped by the build: ${skipped.join(', ')}`);
    assert.ok(rules.length > 0, `${name}: built zero rules`);
  }
});

test('buildAll fails a skill whose _sections.md parses to zero sections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-e2e-'));
  try {
    writeFiles(root, {
      'no-sections/SKILL.md': demoSKill,
      'no-sections/metadata.json': demoMetadata,
      'no-sections/rules/_sections.md': '# Sections\n\nno valid headings here\n',
      'no-sections/rules/arch-alpha.md': rule('Alpha Rule', 'HIGH'),
    });

    const result = buildAll(root);
    assert.deepEqual(result.built, []);
    assert.deepEqual(result.failed, [path.join(root, 'no-sections')]);
    assert.ok(!fs.existsSync(path.join(root, 'no-sections', 'AGENTS.md')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
