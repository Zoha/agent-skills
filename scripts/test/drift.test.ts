import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../build-agents.ts';

/**
 * Drift guard: the committed AGENTS.md and the GENERATED marker sections of SKILL.md are build
 * outputs, but nothing in the repo re-checks them after a rule edit. Without this test, a rule
 * change that was never rebuilt ships as stale guidance to every agent that installs the skill.
 *
 * The output is compared byte-for-byte: the generator no longer stamps a volatile date, so a fresh
 * build is deterministic and must equal the committed file exactly.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.join(__dirname, '..', '..', 'skills');

function skillDirs(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        fs.existsSync(path.join(root, name, 'rules')) &&
        fs.existsSync(path.join(root, name, 'SKILL.md')) &&
        fs.existsSync(path.join(root, name, 'metadata.json')),
    )
    .sort();
}

test('committed AGENTS.md and SKILL.md markers match a fresh build', () => {
  const names = skillDirs(skillsDir);
  assert.ok(names.length > 0, 'expected at least one real skill under skills/');

  // Build into a copy so this test never mutates the working tree.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-drift-'));
  const builtRoot = path.join(tmp, 'skills');
  try {
    fs.cpSync(skillsDir, builtRoot, { recursive: true });
    const { failed } = buildAll(builtRoot);
    assert.deepEqual(failed, [], 'every skill should build without error');

    for (const name of names) {
      const generated = fs.readFileSync(path.join(builtRoot, name, 'AGENTS.md'), 'utf-8');
      const committed = fs.readFileSync(path.join(skillsDir, name, 'AGENTS.md'), 'utf-8');
      assert.equal(
        generated,
        committed,
        `${name}/AGENTS.md is stale — it does not match the rules. Rebuild: cd scripts && npm run build`,
      );

      const generatedSkill = fs.readFileSync(path.join(builtRoot, name, 'SKILL.md'), 'utf-8');
      const committedSkill = fs.readFileSync(path.join(skillsDir, name, 'SKILL.md'), 'utf-8');
      assert.equal(
        generatedSkill,
        committedSkill,
        `${name}/SKILL.md GENERATED markers are stale. Rebuild: cd scripts && npm run build`,
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
