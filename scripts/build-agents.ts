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
