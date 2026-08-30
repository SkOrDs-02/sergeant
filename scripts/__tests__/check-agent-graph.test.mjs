import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { frontmatter } from "../check-agent-graph.mjs";

const AGENT_MD_LINES = [
  "---",
  "name: qa-web",
  "tools: Read, Bash",
  "---",
  "",
  "# qa-web",
  "",
];

function withTempFile(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), "agent-graph-"));
  try {
    const file = join(dir, "agent.md");
    writeFileSync(file, content);
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("frontmatter parses LF files", () => {
  withTempFile(AGENT_MD_LINES.join("\n"), (file) => {
    const { fields } = frontmatter(file);
    assert.equal(fields.name, "qa-web");
    assert.equal(fields.tools, "Read, Bash");
  });
});

// Regression: autocrlf worktrees on Windows materialize .claude/agents/*.md with
// CRLF, which the LF-only delimiter checks used to misread as "no frontmatter"
// (27 false name-mismatch errors from `pnpm lint:agent-graph`).
test("frontmatter parses CRLF files identically", () => {
  withTempFile(AGENT_MD_LINES.join("\r\n"), (file) => {
    const { fields } = frontmatter(file);
    assert.equal(fields.name, "qa-web");
    assert.equal(fields.tools, "Read, Bash");
  });
});

test("frontmatter returns empty fields without a frontmatter block", () => {
  withTempFile("# no frontmatter\r\n", (file) => {
    assert.deepEqual(frontmatter(file).fields, {});
  });
});
