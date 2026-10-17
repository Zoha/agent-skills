#!/usr/bin/env tsx

/**
 * Build script for generating per-skill AGENTS.md and regenerating SKILL.md
 * from individual rule files.
 *
 * Usage: npx tsx build-agents.ts
 *
 * This script:
 * 1. Discovers every skill under skills/ (folders containing rules/ + SKILL.md)
 * 2. Parses YAML frontmatter and _sections.md for metadata
 * 3. Generates a consolidated AGENTS.md per skill
 * 4. Regenerates the GENERATED marker sections of SKILL.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleFrontmatter {
  title: string;
  impact: string;
  impactDescription?: string;
  tags?: string[];
}

export interface Section {
  number: number;
  name: string;
  prefix: string;
  impact: string;
  description: string;
}

export interface SkillMetadata {
  title: string;
  version: string;
  organization: string;
  date: string;
  abstract: string;
  references: string[];
}

export interface Rule {
  filename: string;
  frontmatter: RuleFrontmatter;
  content: string;
  section: Section;
  ruleNumber: string;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

export function parseFrontmatter(content: string): { frontmatter: RuleFrontmatter | null; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { frontmatter: null, body: content };
  }

  const frontmatter: RuleFrontmatter = { title: '', impact: '' };

  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (key === 'title') {
      frontmatter.title = value;
    } else if (key === 'impact') {
      frontmatter.impact = value;
    } else if (key === 'impactDescription') {
      frontmatter.impactDescription = value;
    } else if (key === 'tags') {
      frontmatter.tags = value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  const body = content.slice(match[0].length).trim();
  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Section parsing (_sections.md)
// ---------------------------------------------------------------------------

export function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const line of content.split('\n')) {
    const heading = line.match(/^## (\d+)\. (.+) \(([\w-]+)\)/);
    if (heading) {
      current = {
        number: Number(heading[1]),
        name: heading[2],
        prefix: heading[3],
        impact: '',
        description: '',
      };
      sections.push(current);
      continue;
    }

    const impact = line.match(/^\*\*Impact:\*\* (.+)/);
    if (impact && current) {
      current.impact = impact[1].trim();
      continue;
    }

    const desc = line.match(/^\*\*Description:\*\* (.+)/);
    if (desc && current) {
      current.description = desc[1].trim();
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * GitHub-compatible heading slug (mirrors `github-slugger`): lowercase, drop every
 * character that is not a letter, number, whitespace, `-` or `_`, then turn each
 * remaining space into a hyphen. It deliberately does NOT collapse runs, so
 * "Foo — Bar" -> "foo--bar" (the em dash vanishes, leaving two spaces).
 */
function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function stripRuleBody(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,2}\s+.*\n+/, '')
    .replace(/^\*\*Impact:.*\*\*.*\n+/, '')
    .trim();
}

/** Group rules by section, keep section order, sort rules alphabetically by filename. */
function rulesBySection(rules: Rule[], sections: Section[]): Array<{ section: Section; rules: Rule[] }> {
  const groups: Array<{ section: Section; rules: Rule[] }> = [];

  for (const section of sections) {
    const sectionRules = rules
      .filter((r) => r.section.prefix === section.prefix)
      .sort((a, b) => a.filename.localeCompare(b.filename));
    if (sectionRules.length === 0) continue;

    sectionRules.forEach((rule, i) => {
      rule.ruleNumber = `${section.number}.${i + 1}`;
    });
    groups.push({ section, rules: sectionRules });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// AGENTS.md generation
// ---------------------------------------------------------------------------

export function generateAgentsMd(rules: Rule[], metadata: SkillMetadata, sections: Section[]): string {
  const groups = rulesBySection(rules, sections);

  let doc = `# ${metadata.title}

**Version ${metadata.version}**
${metadata.organization}
${metadata.date}

> **Note:**
> This document is mainly for agents and LLMs to follow when maintaining,
> generating, or refactoring codebases. It is generated from the rule files
> in \`rules/\` — edit those, not this file.

---

## Abstract

${metadata.abstract}

---

## Table of Contents

`;

  for (const { section, rules: sectionRules } of groups) {
    doc += `${section.number}. [${section.name}](#${section.number}-${slug(section.name)}) — **${section.impact}**\n`;
    sectionRules.forEach((rule, i) => {
      const anchor = `${section.number}${i + 1}-${slug(rule.frontmatter.title)}`;
      doc += `   - ${section.number}.${i + 1} [${rule.frontmatter.title}](#${anchor})\n`;
    });
  }

  doc += '\n---\n\n';

  for (const { section, rules: sectionRules } of groups) {
    doc += `## ${section.number}. ${section.name}\n\n`;
    doc += `**Section Impact: ${section.impact}**\n\n`;

    for (const rule of sectionRules) {
      doc += `### ${rule.ruleNumber} ${rule.frontmatter.title}\n\n`;
      doc += rule.frontmatter.impactDescription
        ? `**Impact: ${rule.frontmatter.impact}** — ${rule.frontmatter.impactDescription}\n\n`
        : `**Impact: ${rule.frontmatter.impact}**\n\n`;
      doc += stripRuleBody(rule.content);
      doc += '\n\n---\n\n';
    }
  }

  doc += '## References\n\n';
  for (const ref of metadata.references) {
    doc += `- ${ref}\n`;
  }

  const today = new Date().toISOString().split('T')[0];
  doc += `\n---\n\n*Generated by build-agents.ts on ${today}*\n`;

  return doc;
}

// ---------------------------------------------------------------------------
// SKILL.md regeneration
// ---------------------------------------------------------------------------

function buildSectionsTable(sections: Section[]): string {
  let table = '| Priority | Category | Impact | Prefix |\n';
  table += '|----------|----------|--------|--------|\n';
  for (const s of sections) {
    table += `| ${s.number} | ${s.name} | ${s.impact} | \`${s.prefix}\` |\n`;
  }
  return table.trimEnd();
}

function buildQuickReference(rules: Rule[], sections: Section[]): string {
  const groups = rulesBySection(rules, sections);
  const blocks = groups.map(({ section, rules: sectionRules }) => {
    const items = sectionRules
      .map((r) => `- \`${r.filename.replace(/\.md$/, '')}\` - ${r.frontmatter.title}`)
      .join('\n');
    return `### ${section.number}. ${section.name} (${section.impact})\n\n${items}`;
  });
  return blocks.join('\n\n');
}

function replaceMarkers(doc: string, name: string, content: string, eol: string): string {
  const re = new RegExp(
    `<!-- GENERATED:START:${name} -->\\r?\\n[\\s\\S]*?\\r?\\n<!-- GENERATED:END:${name} -->`,
  );
  if (!re.test(doc)) {
    throw new Error(`SKILL.md is missing the GENERATED:${name} marker pair`);
  }
  const normalized = content.split('\n').join(eol);
  return doc.replace(
    re,
    () =>
      `<!-- GENERATED:START:${name} -->${eol}${normalized}${eol}<!-- GENERATED:END:${name} -->`,
  );
}

export function regenerateSkillMd(
  skillMd: string,
  metadata: SkillMetadata,
  rules: Rule[],
  sections: Section[],
): string {
  const eol = skillMd.includes('\r\n') ? '\r\n' : '\n';

  // Sync the frontmatter version (only within the leading --- block).
  let out = skillMd;
  const fmMatch = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fmMatch) {
    const newFm = fmMatch[1].replace(/^([ \t]*version:[ \t]*).*/m, `$1"${metadata.version}"`);
    out = `---${eol}${newFm}${eol}---` + skillMd.slice(fmMatch[0].length);
  }

  out = replaceMarkers(out, 'sections', buildSectionsTable(sections), eol);
  out = replaceMarkers(out, 'rules', buildQuickReference(rules, sections), eol);

  return out;
}

// ---------------------------------------------------------------------------
// Skill discovery & loading
// ---------------------------------------------------------------------------

export function discoverSkills(skillsRoot: string): string[] {
  if (!fs.existsSync(skillsRoot)) return [];
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsRoot, entry.name))
    .filter(
      (dir) =>
        fs.existsSync(path.join(dir, 'rules')) && fs.existsSync(path.join(dir, 'SKILL.md')),
    )
    .sort();
}

export function readMetadata(skillDir: string): SkillMetadata {
  return JSON.parse(
    fs.readFileSync(path.join(skillDir, 'metadata.json'), 'utf-8'),
  ) as SkillMetadata;
}

export function readRules(
  skillDir: string,
  sections: Section[],
): { rules: Rule[]; skipped: string[] } {
  const rulesDir = path.join(skillDir, 'rules');
  const files = fs
    .readdirSync(rulesDir)
    .filter((file) => file.endsWith('.md') && !file.startsWith('_'));

  const rules: Rule[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const { frontmatter, body } = parseFrontmatter(
      fs.readFileSync(path.join(rulesDir, file), 'utf-8'),
    );
    if (!frontmatter || !frontmatter.title || !frontmatter.impact) {
      skipped.push(file);
      continue;
    }
    const section = sections.find((s) => file.startsWith(s.prefix));
    if (!section) {
      skipped.push(file);
      continue;
    }
    rules.push({ filename: file, frontmatter, content: body, section, ruleNumber: '' });
  }

  return { rules, skipped };
}

export function buildSkill(skillDir: string): { ruleCount: number; skipped: string[] } {
  const metadata = readMetadata(skillDir);
  const sections = parseSections(
    fs.readFileSync(path.join(skillDir, 'rules', '_sections.md'), 'utf-8'),
  );
  if (sections.length === 0) {
    throw new Error('rules/_sections.md parsed to zero sections');
  }
  const { rules, skipped } = readRules(skillDir, sections);

  // Compute both outputs before writing so a failure leaves no partial output.
  const agentsMd = generateAgentsMd(rules, metadata, sections);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const newSkillMd = regenerateSkillMd(
    fs.readFileSync(skillMdPath, 'utf-8'),
    metadata,
    rules,
    sections,
  );

  fs.writeFileSync(path.join(skillDir, 'AGENTS.md'), agentsMd);
  fs.writeFileSync(skillMdPath, newSkillMd);

  return { ruleCount: rules.length, skipped };
}

export function buildAll(skillsRoot: string): { built: string[]; failed: string[] } {
  const built: string[] = [];
  const failed: string[] = [];

  for (const skillDir of discoverSkills(skillsRoot)) {
    try {
      const { ruleCount, skipped } = buildSkill(skillDir);
      built.push(skillDir);
      console.log(`  ${path.basename(skillDir)}: ${ruleCount} rules`);
      for (const file of skipped) {
        console.warn(`    warning: skipped ${file} (no frontmatter or unknown prefix)`);
      }
    } catch (err) {
      failed.push(skillDir);
      console.error(`  ${path.basename(skillDir)}: FAILED — ${(err as Error).message}`);
    }
  }

  return { built, failed };
}

export function main(
  skillsRoot: string = process.env.SKILLS_ROOT ?? path.join(__dirname, '..', 'skills'),
): void {
  console.log('Building agent skills...\n');

  const { built, failed } = buildAll(skillsRoot);

  console.log(`\nBuilt ${built.length} skill(s), ${failed.length} failed.`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
