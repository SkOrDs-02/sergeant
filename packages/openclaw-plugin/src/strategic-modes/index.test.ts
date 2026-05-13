/**
 * Stage 5b PR-1 + PR-2 + PR-4 — unit tests for `matchStrategicMode()` +
 * the `/plan`, `/analyze`, and `/okr` mode definitions. Covers per mode:
 *
 *   - `<slash> <topic>` happy path returns the right slug + trigger +
 *     primer + stripped topic.
 *   - Case-insensitive match.
 *   - Word-boundary anchor (e.g. `/plant`, `/analyzed`, `/okrs` must
 *     NOT match).
 *   - Topic-required guard — bare slash (no topic) falls through for
 *     `/plan` and `/analyze` but is a valid match for `/okr` (empty
 *     `topic`).
 *   - Surrounding whitespace is tolerated.
 *   - Non-slash, non-prefix, non-string inputs fall through.
 *   - Multi-line topics work (Telegram sends `/plan churn\nadditional context`).
 *   - Primer is byte-for-byte identical to the legacy console primer
 *     (drift gate — when the console bot retires in Stage 7 these tests
 *     can be deleted along with the legacy file).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ANALYZE_PRIMER } from "./analyze.js";
import {
  ALL_STRATEGIC_MODES,
  analyzeMode,
  matchStrategicMode,
  okrMode,
  planMode,
} from "./index.js";
import { OKR_PRIMER } from "./okr.js";
import { PLAN_PRIMER } from "./plan.js";

describe("ALL_STRATEGIC_MODES", () => {
  it("includes /plan, /analyze, and /okr (PR-1 + PR-2 + PR-4) in declaration order", () => {
    expect(ALL_STRATEGIC_MODES).toHaveLength(3);
    expect(ALL_STRATEGIC_MODES[0]).toBe(planMode);
    expect(ALL_STRATEGIC_MODES[1]).toBe(analyzeMode);
    expect(ALL_STRATEGIC_MODES[2]).toBe(okrMode);
  });

  it("every entry exposes a unique slug + trigger pair", () => {
    const slugs = ALL_STRATEGIC_MODES.map((m) => m.slug);
    const triggers = ALL_STRATEGIC_MODES.map((m) => m.trigger);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(triggers).size).toBe(triggers.length);
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

describe("matchStrategicMode — /analyze", () => {
  it("matches `/analyze <anomaly>` and returns slug + trigger + primer + topic", () => {
    const result = matchStrategicMode("/analyze signups dropped 30% yesterday");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("analyze");
    expect(result?.trigger).toBe("strategic_analyze");
    expect(result?.primer).toBe(ANALYZE_PRIMER);
    expect(result?.topic).toBe("signups dropped 30% yesterday");
  });

  it("is case-insensitive (`/ANALYZE`, `/Analyze`)", () => {
    expect(matchStrategicMode("/ANALYZE issue")?.slug).toBe("analyze");
    expect(matchStrategicMode("/Analyze issue")?.slug).toBe("analyze");
  });

  it("tolerates leading/trailing whitespace + multiple spaces", () => {
    const result = matchStrategicMode(
      "   /analyze   churn spike on free tier  ",
    );
    expect(result?.topic).toBe("churn spike on free tier");
  });

  it("supports multi-line anomalies", () => {
    const result = matchStrategicMode(
      "/analyze checkout drop\nfrom 14:00 yesterday\nposthog funnel link?",
    );
    expect(result?.slug).toBe("analyze");
    expect(result?.topic).toBe(
      "checkout drop\nfrom 14:00 yesterday\nposthog funnel link?",
    );
  });

  it("does NOT match `/analyzed`, `/analyzes`, `/analyzer` (word-boundary)", () => {
    expect(matchStrategicMode("/analyzed this already")).toBeNull();
    expect(matchStrategicMode("/analyzes things")).toBeNull();
    expect(matchStrategicMode("/analyzer setup")).toBeNull();
  });

  it("does NOT match bare `/analyze` with no anomaly (topicRequired)", () => {
    expect(matchStrategicMode("/analyze")).toBeNull();
    expect(matchStrategicMode("/analyze   ")).toBeNull();
  });

  it("does NOT match `analyze something` (no leading slash)", () => {
    expect(matchStrategicMode("analyze something")).toBeNull();
  });

  it("does NOT match when `/analyze` appears mid-message", () => {
    expect(matchStrategicMode("please /analyze this for me")).toBeNull();
  });

  it("/plan and /analyze do not cross-match each other", () => {
    expect(matchStrategicMode("/plan growth strategy")?.slug).toBe("plan");
    expect(matchStrategicMode("/analyze growth drop")?.slug).toBe("analyze");
  });
});

describe("matchStrategicMode — /okr", () => {
  it("matches bare `/okr` (topicRequired: false) and returns empty topic", () => {
    const result = matchStrategicMode("/okr");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("okr");
    expect(result?.trigger).toBe("strategic_okr");
    expect(result?.primer).toBe(OKR_PRIMER);
    expect(result?.topic).toBe("");
  });

  it("matches `/okr   ` (trailing whitespace) and returns empty topic", () => {
    const result = matchStrategicMode("/okr   ");
    expect(result?.slug).toBe("okr");
    expect(result?.topic).toBe("");
  });

  it("matches `/okr <topic>` and returns slug + trigger + primer + topic", () => {
    const result = matchStrategicMode("/okr Q3 progress");
    expect(result).not.toBeNull();
    expect(result?.slug).toBe("okr");
    expect(result?.trigger).toBe("strategic_okr");
    expect(result?.primer).toBe(OKR_PRIMER);
    expect(result?.topic).toBe("Q3 progress");
  });

  it("is case-insensitive (`/OKR`, `/Okr`)", () => {
    expect(matchStrategicMode("/OKR")?.slug).toBe("okr");
    expect(matchStrategicMode("/Okr Q3 review")?.slug).toBe("okr");
  });

  it("tolerates leading/trailing whitespace + multiple spaces", () => {
    const result = matchStrategicMode("   /okr   Q3 review  ");
    expect(result?.topic).toBe("Q3 review");
  });

  it("supports multi-line topics", () => {
    const result = matchStrategicMode(
      "/okr Q3 progress\nrevenue KR is behind\nretention OK",
    );
    expect(result?.slug).toBe("okr");
    expect(result?.topic).toBe(
      "Q3 progress\nrevenue KR is behind\nretention OK",
    );
  });

  it("does NOT match `/okrs`, `/okrun`, `/okrtype` (word-boundary)", () => {
    expect(matchStrategicMode("/okrs")).toBeNull();
    expect(matchStrategicMode("/okrun setup")).toBeNull();
    expect(matchStrategicMode("/okrtype Q3")).toBeNull();
  });

  it("does NOT match `okr something` (no leading slash)", () => {
    expect(matchStrategicMode("okr something")).toBeNull();
    expect(matchStrategicMode("okr")).toBeNull();
  });

  it("does NOT match when `/okr` appears mid-message", () => {
    expect(matchStrategicMode("please /okr review")).toBeNull();
  });

  it("/plan, /analyze, /okr do not cross-match each other", () => {
    expect(matchStrategicMode("/plan growth strategy")?.slug).toBe("plan");
    expect(matchStrategicMode("/analyze growth drop")?.slug).toBe("analyze");
    expect(matchStrategicMode("/okr Q3 progress")?.slug).toBe("okr");
    expect(matchStrategicMode("/okr")?.slug).toBe("okr");
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
    // The legacy primer lives in `tools/openclaw/src/agents/strategic-modes.ts`.
    // We do NOT import it (the plugin must stay package-independent from the
    // console workspace) — we read the file and grep for the inline literal.
    // When the console bot retires in Stage 7, this test + the legacy file
    // can be deleted together.
    const legacyPath = resolve(
      __dirname,
      "../../../../tools/openclaw/src/agents/strategic-modes.ts",
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

describe("ANALYZE_PRIMER", () => {
  it("contains the STRATEGIC_MODE sentinel and the 4 step markers", () => {
    expect(ANALYZE_PRIMER).toContain("STRATEGIC_MODE: analyze");
    expect(ANALYZE_PRIMER).toContain("1) ANOMALY");
    expect(ANALYZE_PRIMER).toContain("2) HYPOTHESES");
    expect(ANALYZE_PRIMER).toContain("3) EVIDENCE");
    expect(ANALYZE_PRIMER).toContain("4) RANKED CONCLUSION");
  });

  it("matches the legacy console primer byte-for-byte (drift gate)", () => {
    const legacyPath = resolve(
      __dirname,
      "../../../../tools/openclaw/src/agents/strategic-modes.ts",
    );
    const legacySource = readFileSync(legacyPath, "utf8");
    const blockMatch = legacySource.match(
      /const ANALYZE_PRIMER =\s*([\s\S]*?);\s*\n/,
    );
    expect(blockMatch).not.toBeNull();
    const reconstructed = Function(
      "return (" + (blockMatch?.[1] ?? "''") + ")",
    )() as string;
    expect(ANALYZE_PRIMER).toBe(reconstructed);
  });
});

describe("OKR_PRIMER", () => {
  it("contains the STRATEGIC_MODE sentinel and the 4 step markers", () => {
    expect(OKR_PRIMER).toContain("STRATEGIC_MODE: okr");
    expect(OKR_PRIMER).toContain("1) ACTIVE OKRs");
    expect(OKR_PRIMER).toContain("2) PROGRESS PER KR");
    expect(OKR_PRIMER).toContain("3) BOTTLENECKS");
    expect(OKR_PRIMER).toContain("4) NEXT ACTIONS");
  });

  it("matches the legacy console primer byte-for-byte (drift gate)", () => {
    const legacyPath = resolve(
      __dirname,
      "../../../../tools/openclaw/src/agents/strategic-modes.ts",
    );
    const legacySource = readFileSync(legacyPath, "utf8");
    const blockMatch = legacySource.match(
      /const OKR_PRIMER =\s*([\s\S]*?);\s*\n/,
    );
    expect(blockMatch).not.toBeNull();
    const reconstructed = Function(
      "return (" + (blockMatch?.[1] ?? "''") + ")",
    )() as string;
    expect(OKR_PRIMER).toBe(reconstructed);
  });
});
