/**
 * Stage 5b PR-1 — unit tests for `matchStrategicMode()` + the `/plan`
 * definition. Covers:
 *
 *   - `/plan <topic>` happy path returns the right slug + trigger +
 *     primer + stripped topic.
 *   - Case-insensitive match (`/PLAN`).
 *   - Word-boundary anchor — `/plant` must NOT match `/plan`.
 *   - Topic-required guard — bare `/plan` (no topic) falls through.
 *   - Surrounding whitespace is tolerated.
 *   - Non-slash, non-prefix, non-string inputs fall through.
 *   - Multi-line topics work (Telegram sends `/plan churn\nadditional context`).
 *   - PLAN_PRIMER is byte-for-byte identical to the legacy console primer
 *     (drift gate — when the console bot retires in Stage 7 this test
 *     can be deleted along with the legacy file).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_STRATEGIC_MODES, matchStrategicMode, planMode } from "./index.js";
import { PLAN_PRIMER } from "./plan.js";

describe("ALL_STRATEGIC_MODES", () => {
  it("includes /plan as the first entry (PR-1 ships /plan only)", () => {
    expect(ALL_STRATEGIC_MODES).toHaveLength(1);
    expect(ALL_STRATEGIC_MODES[0]).toBe(planMode);
  });
});

describe("matchStrategicMode — /plan", () => {
  it("matches `/plan <topic>` and returns slug + trigger + primer + topic", () => {
    const result = matchStrategicMode("/plan churn-reduction-q3");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("plan");
    expect(result?.trigger).toBe("strategic_plan");
    expect(result?.primer).toBe(PLAN_PRIMER);
    expect(result?.topic).toBe("churn-reduction-q3");
  });

  it("is case-insensitive (`/PLAN`, `/Plan`)", () => {
    expect(matchStrategicMode("/PLAN topic")?.slug).toBe("plan");
    expect(matchStrategicMode("/Plan topic")?.slug).toBe("plan");
  });

  it("tolerates leading/trailing whitespace around the message", () => {
    const result = matchStrategicMode("   /plan growth-bottleneck  ");
    expect(result?.topic).toBe("growth-bottleneck");
  });

  it("tolerates multiple spaces between slash command and topic", () => {
    const result = matchStrategicMode("/plan   how should we price?");
    expect(result?.topic).toBe("how should we price?");
  });

  it("supports multi-line topics (Telegram newline-after-slash)", () => {
    const result = matchStrategicMode(
      "/plan churn-q3\nadditional context\nmore lines",
    );
    expect(result?.slug).toBe("plan");
    expect(result?.topic).toBe("churn-q3\nadditional context\nmore lines");
  });

  it("does NOT match `/plant` (word-boundary anchor)", () => {
    expect(matchStrategicMode("/plant a tree")).toBeNull();
  });

  it("does NOT match `/planner` (word-boundary anchor)", () => {
    expect(matchStrategicMode("/planner setup")).toBeNull();
  });

  it("does NOT match bare `/plan` with no topic (topicRequired)", () => {
    expect(matchStrategicMode("/plan")).toBeNull();
    expect(matchStrategicMode("/plan   ")).toBeNull();
  });

  it("does NOT match `plan something` (no leading slash)", () => {
    expect(matchStrategicMode("plan something")).toBeNull();
  });

  it("does NOT match when `/plan` appears mid-message", () => {
    expect(matchStrategicMode("can you /plan this for me")).toBeNull();
  });

  it("does NOT match other slash commands like `/metrics`", () => {
    expect(matchStrategicMode("/metrics")).toBeNull();
    expect(matchStrategicMode("/runway")).toBeNull();
    expect(matchStrategicMode("/think how to ship")).toBeNull();
  });

  it("falls through on empty / whitespace / non-string input", () => {
    expect(matchStrategicMode("")).toBeNull();
    expect(matchStrategicMode("   ")).toBeNull();
    expect(matchStrategicMode(undefined as unknown as string)).toBeNull();
    expect(matchStrategicMode(null as unknown as string)).toBeNull();
    expect(matchStrategicMode(123 as unknown as string)).toBeNull();
  });
});

describe("PLAN_PRIMER", () => {
  it("contains the STRATEGIC_MODE sentinel and the 4 step markers", () => {
    expect(PLAN_PRIMER).toContain("STRATEGIC_MODE: plan");
    expect(PLAN_PRIMER).toContain("1) GOAL");
    expect(PLAN_PRIMER).toContain("2) CONTEXT");
    expect(PLAN_PRIMER).toContain("3) OPTIONS");
    expect(PLAN_PRIMER).toContain("4) DECISION + FOLLOWUP");
  });

  it("matches the legacy console primer byte-for-byte (drift gate)", () => {
    // The legacy primer lives in `tools/console/src/agents/strategic-modes.ts`.
    // We do NOT import it (the plugin must stay package-independent from the
    // console workspace) — we read the file and grep for the inline literal.
    // When the console bot retires in Stage 7, this test + the legacy file
    // can be deleted together.
    const legacyPath = resolve(
      __dirname,
      "../../../../tools/console/src/agents/strategic-modes.ts",
    );
    const legacySource = readFileSync(legacyPath, "utf8");

    // Strip outer quotes/concatenation: rebuild the multi-line constant
    // by capturing the body between `const PLAN_PRIMER =` and the
    // trailing `;` (the legacy file uses string concatenation across
    // ~15 lines).
    const blockMatch = legacySource.match(
      /const PLAN_PRIMER =\s*([\s\S]*?);\s*\n/,
    );
    expect(blockMatch).not.toBeNull();
    const reconstructed = Function(
      "return (" + (blockMatch?.[1] ?? "''") + ")",
    )() as string;
    expect(PLAN_PRIMER).toBe(reconstructed);
  });
});
