import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildAll, buildSkill } from '../build-agents.ts';

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
    assert.deepEqual(skipped.sort(), ['broken.md', 'xyz-unknown.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
