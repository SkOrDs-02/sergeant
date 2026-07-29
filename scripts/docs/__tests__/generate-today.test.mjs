// scripts/docs/__tests__/generate-today.test.mjs
//
// Unit tests for daily brief priority selection.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractNextPhase, pickPriorityItems } from "../generate-today.mjs";

describe("extractNextPhase", () => {
  it("normalizes actionable phase markers", () => {
    assert.deepEqual(extractNextPhase("Active — Phase 2 IN PROGRESS"), {
      phase: "2",
      kind: "in progress",
    });
    assert.deepEqual(extractNextPhase("Phase 7 blocked by owner"), {
      phase: "7",
      kind: "blocked",
    });
  });

  it("returns null without a phase marker", () => {
    assert.equal(extractNextPhase("Active — executable residual"), null);
  });
});

describe("pickPriorityItems", () => {
  it("includes explicit agent-ready work without requiring Phase wording", () => {
    const tmp = mkdtempSync(join(tmpdir(), "today-test-"));
    try {
      for (const name of ["blocked.md", "ready.md", "ignored.md"]) {
        writeFileSync(join(tmp, name), `# ${name}\n`, "utf8");
      }

      const tracker = { id: "planning", title: "Планування" };
      const report = [
        {
          tracker,
          entries: [
            {
              relPath: "ready.md",
              linkPath: "ready.md",
              title: "Ready",
              rawStatus: "Active — executable residual",
              agentReady: "yes",
            },
            {
              relPath: "blocked.md",
              linkPath: "blocked.md",
              title: "Blocked phase",
              rawStatus: "Active — Phase 3 blocked",
              agentReady: "blocked",
            },
            {
              relPath: "ignored.md",
              linkPath: "ignored.md",
              title: "Not actionable",
              rawStatus: "Active",
              agentReady: null,
            },
          ],
        },
      ];

      const items = pickPriorityItems(report, tmp);
      assert.deepEqual(
        items.map((item) => [item.title, item.priorityKind]),
        [
          ["Blocked phase", "blocked"],
          ["Ready", "agent-ready"],
        ],
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
