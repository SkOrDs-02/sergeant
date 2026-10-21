import { describe, expect, it } from "vitest";
import { runOne } from "./run.js";
import { runVisionOne } from "./vision.js";
import { toMarkdown } from "./report.js";
import type { Candidate, GoldenCase, Pipeline, RunResult } from "./types.js";

const candidate: Candidate = {
  provider: "openrouter",
  model: "local/example",
  label: "Example",
};
const golden: GoldenCase = { name: "case", user: "Привіт", trap: "fixture" };
const pipeline: Pipeline = {
  key: "local",
  label: "Local",
  system: "fixture",
  promptOrigin: "fixture",
  maxTokens: 32,
  candidates: [candidate],
  judge: () => true,
  cases: [golden],
};

describe("dry-run не видається за якість живої моделі", () => {
  it.each([
    ["text", runOne],
    ["vision", runVisionOne],
  ] as const)(
    "%s runner позначає походження stub-результату",
    async (_name, run) => {
      const result = await run(pipeline, golden, candidate, true);
      expect(result).toMatchObject({
        executionMode: "dry-run",
        ok: true,
        text: "stub",
      });
    },
  );
  it("звіт stub не містить accuracy, latency чи cost порівняння моделей", async () => {
    const result = await runOne(pipeline, golden, candidate, true);
    const report = toMarkdown([result], [pipeline], "2026-10-21");
    expect(report).toContain("DRY RUN");
    expect(report).toContain("моделі не викликались");
    expect(report).toContain("local/example");
    expect(report).not.toContain("1/1");
    expect(report).not.toContain("Медіанна затримка");
    expect(report).not.toContain("## Вартість");
  });
  it("не змішує stub і живі рядки в одному benchmark", async () => {
    const dry = await runOne(pipeline, golden, candidate, true);
    const live: RunResult = { ...dry };
    delete live.executionMode;
    expect(() => toMarkdown([dry, live], [pipeline], "2026-10-21")).toThrow(
      /mix/i,
    );
  });
});
