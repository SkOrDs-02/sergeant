// scripts/docs/__tests__/generate-today.test.mjs
//
// Unit tests for daily brief priority selection.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

    const items = pickPriorityItems(report);
    assert.deepEqual(
      items.map((item) => [item.title, item.priorityKind]),
      [
        ["Blocked phase", "blocked"],
        ["Ready", "agent-ready"],
      ],
    );
  });

  it("порядок не залежить від файлової системи", () => {
    // Регресія: сортування колись мало tie-break по `mtimeMs`, тож у
    // свіжому клоні порядок задавав `actions/checkout`, а не зміст. Тут
    // жодного файлу на диску немає навмисно — якщо функція знову почне
    // ходити у fs, цей кейс упаде (або скине запис, або кине).
    const tracker = { id: "planning", title: "Планування" };
    const entry = (relPath, title) => ({
      relPath,
      linkPath: relPath,
      title,
      rawStatus: "Active — executable residual",
      agentReady: "yes",
    });
    const report = [
      {
        tracker,
        entries: [entry("zeta.md", "Zeta"), entry("alpha.md", "Alpha")],
      },
    ];

    assert.deepEqual(
      pickPriorityItems(report).map((item) => item.title),
      ["Alpha", "Zeta"],
    );
  });
});
