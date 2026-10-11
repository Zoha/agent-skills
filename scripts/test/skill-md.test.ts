import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regenerateSkillMd } from '../build-agents.ts';
import type { Rule, Section, SkillMetadata } from '../build-agents.ts';

const metadata: SkillMetadata = {
  title: 'Test Skill',
  version: '9.9.9',
  organization: 'Org',
  date: 'October 2026',
  abstract: 'abs',
  references: [],
};

const sections: Section[] = [
  { number: 1, name: 'Architecture', prefix: 'arch-', impact: 'CRITICAL', description: 'd' },
  { number: 2, name: 'Empty', prefix: 'empty-', impact: 'LOW', description: 'd' },
];

const rules: Rule[] = [
  {
    filename: 'arch-beta.md',
    frontmatter: { title: 'Beta Rule', impact: 'LOW' },
    content: 'x',
    section: sections[0],
    ruleNumber: '1.2',
  },
  {
    filename: 'arch-alpha.md',
    frontmatter: { title: 'Alpha Rule', impact: 'HIGH' },
    content: 'x',
    section: sections[0],
    ruleNumber: '1.1',
  },
];

const skillMd = `---
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
`;

function between(out: string, name: string): string {
  const re = new RegExp(
    `<!-- GENERATED:START:${name} -->\\n([\\s\\S]*?)\\n<!-- GENERATED:END:${name} -->`,
  );
  const m = out.match(re);
  assert.ok(m, `missing ${name} markers in output`);
  return m![1];
}

test('regenerateSkillMd syncs version in frontmatter', () => {
  const out = regenerateSkillMd(skillMd, metadata, rules, sections);
  assert.ok(out.includes('  version: "9.9.9"\n'));
  assert.ok(!out.includes('0.0.1'));
});

test('regenerateSkillMd rebuilds the sections table (all sections)', () => {
  const out = regenerateSkillMd(skillMd, metadata, rules, sections);
  const expected = [
    '| Priority | Category | Impact | Prefix |',
    '|----------|----------|--------|--------|',
    '| 1 | Architecture | CRITICAL | `arch-` |',
    '| 2 | Empty | LOW | `empty-` |',
  ].join('\n');
  assert.equal(between(out, 'sections'), expected);
});

test('regenerateSkillMd rebuilds the quick reference (non-empty sections, sorted)', () => {
  const out = regenerateSkillMd(skillMd, metadata, rules, sections);
  const expected = [
    '### 1. Architecture (CRITICAL)',
    '',
    '- `arch-alpha` - Alpha Rule',
    '- `arch-beta` - Beta Rule',
  ].join('\n');
  assert.equal(between(out, 'rules'), expected);
  assert.ok(!out.includes('### 2. Empty'));
});

test('regenerateSkillMd preserves hand-written prose outside markers', () => {
  const out = regenerateSkillMd(skillMd, metadata, rules, sections);
  assert.ok(out.includes('Hand-written intro prose that must survive.'));
  assert.ok(out.includes('Hand-written usage prose that must survive.'));
});

test('regenerateSkillMd throws when a marker pair is missing', () => {
  const noMarkers = skillMd
    .replace('<!-- GENERATED:START:sections -->', '')
    .replace('<!-- GENERATED:END:sections -->', '');
  assert.throws(() => regenerateSkillMd(noMarkers, metadata, rules, sections));
});
