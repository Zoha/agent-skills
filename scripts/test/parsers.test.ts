import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, parseSections } from '../build-agents.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('parseFrontmatter extracts fields, strips quotes, splits tags', () => {
  const input = `---
title: Avoid Circular Dependencies
impact: CRITICAL
impactDescription: "#1 cause of runtime crashes"
tags: architecture, modules, dependencies
---

## Avoid Circular Dependencies

body text
`;
  const { frontmatter, body } = parseFrontmatter(input);
  assert.ok(frontmatter);
  assert.equal(frontmatter.title, 'Avoid Circular Dependencies');
  assert.equal(frontmatter.impact, 'CRITICAL');
  assert.equal(frontmatter.impactDescription, '#1 cause of runtime crashes');
  assert.deepEqual(frontmatter.tags, ['architecture', 'modules', 'dependencies']);
  assert.equal(body, '## Avoid Circular Dependencies\n\nbody text');
});

test('parseFrontmatter with only required keys leaves optionals undefined', () => {
  const input = `---
title: Simple Rule
impact: LOW
---

body
`;
  const { frontmatter, body } = parseFrontmatter(input);
  assert.ok(frontmatter);
  assert.equal(frontmatter.title, 'Simple Rule');
  assert.equal(frontmatter.impact, 'LOW');
  assert.equal(frontmatter.impactDescription, undefined);
  assert.equal(frontmatter.tags, undefined);
  assert.equal(body, 'body');
});

test('parseFrontmatter returns null frontmatter when none present', () => {
  const input = '# Just a heading\n\nsome text';
  const { frontmatter, body } = parseFrontmatter(input);
  assert.equal(frontmatter, null);
  assert.equal(body, input);
});

test('parseFrontmatter keeps unquoted values verbatim', () => {
  const input = `---
title: Rule
impact: MEDIUM
impactDescription: some description here
---

body
`;
  const { frontmatter } = parseFrontmatter(input);
  assert.equal(frontmatter?.impactDescription, 'some description here');
});

test('parseSections parses the real _sections.md', () => {
  const content = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'nestjs-best-practices', 'rules', '_sections.md'),
    'utf-8',
  );
  const sections = parseSections(content);
  assert.equal(sections.length, 10);
  assert.deepEqual(sections[0], {
    number: 1,
    name: 'Architecture',
    prefix: 'arch-',
    impact: 'CRITICAL',
    description:
      'Proper module organization and dependency management are the foundation of maintainable NestJS applications. Circular dependencies and god services are the #1 architecture killer.',
  });
  const db = sections.find((s) => s.prefix === 'db-');
  assert.equal(db?.name, 'Database & ORM');
  assert.equal(db?.number, 7);
  for (const s of sections) {
    assert.ok(s.description.length > 0, `section ${s.name} has empty description`);
  }
});
