// scripts/__tests__/check-agents-family-sync.test.mjs
//
// Run with: node --test scripts/__tests__/check-agents-family-sync.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  analyzeAgentWrapper,
  checkAgentsFamilySync,
} from "../check-agents-family-sync.mjs";

const VALID = [
  "# Claude in Sergeant",
  "",
  "> **Last validated:** 2026-05-14 by @codex. **Next review:** 2026-08-12.",
  "> **Status:** Active",
  "",
  "> **Single source of truth → [AGENTS.md](./AGENTS.md).** Thin wrapper.",
  "",
  "## Startup flow",
  "",
  "1. Прочитай [AGENTS.md](./AGENTS.md).",
  "2. Почни з `.agents/skills/sergeant-start-here/SKILL.md`.",
  "3. Завантаж рівно один specialist skill.",
  "4. Якщо під задачу є playbook, виконуй його.",
  "5. Перший раз у репо? Пройди onboarding.",
  "",
  "## Notes",
  "",
  "- Keep this slim.",
].join("\n");

test("analyzeAgentWrapper accepts a thin canonical wrapper", () => {
  assert.deepEqual(analyzeAgentWrapper(VALID, "CLAUDE.md"), []);
});

test("analyzeAgentWrapper catches duplicate source-of-truth lines", () => {
  const content = `${VALID}\n\n> **Single source of truth → [AGENTS.md](./AGENTS.md).** Duplicate.`;
  const errors = analyzeAgentWrapper(content, "CLAUDE.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expected exactly one/);
});

test("analyzeAgentWrapper catches short or malformed startup flow", () => {
  const content = [
    "# Devin in Sergeant",
    "",
    "> **Single source of truth → [AGENTS.md](./AGENTS.md).** Thin wrapper.",
    "",
    "## Startup flow",
    "",
    "1. Do something else.",
  ].join("\n");

  const errors = analyzeAgentWrapper(content, "DEVIN.md");
  assert.equal(errors.length, 2);
  assert.match(errors.join("\n"), /at least 5 numbered items/);
  assert.match(errors.join("\n"), /item 1 must start/);
});

test("checkAgentsFamilySync checks existing wrappers and ignores missing optional ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "agents-family-sync-"));
  try {
    writeFileSync(join(dir, "CLAUDE.md"), VALID);
    writeFileSync(join(dir, "DEVIN.md"), VALID.replace("Claude", "Devin"));
    const report = checkAgentsFamilySync(dir);
    assert.equal(report.ok, true);
    assert.deepEqual(report.checked, ["CLAUDE.md", "DEVIN.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
