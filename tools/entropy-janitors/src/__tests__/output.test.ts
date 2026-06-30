import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIssuePayload, printCliSummary } from "../shared/output.js";
import { redact } from "../shared/logger-loader.js";
import type { JanitorResult, JanitorReport } from "../shared/types.js";

const baseReport: JanitorReport = {
  kind: "doc-drift",
  generatedAt: "2026-06-29T10:00:00.000Z",
  findings: [
    {
      kind: "missing-file",
      path: "docs/foo.md",
      line: 12,
      message: "Reference `apps/web/src/missing.ts` does not exist in repo.",
      severity: "error",
    },
  ],
  summary: { scanned: 100, findings: 1, durationMs: 50 },
};

const baseResult: JanitorResult = {
  report: baseReport,
  shouldOpenIssue: true,
  issueTitle: "tech-debt(doc-drift): 1 broken doc reference",
  issueBody: "",
  issueLabels: ["entropy-janitor/doc-drift", "tech-debt"],
};

describe("output.buildIssuePayload", () => {
  it("renders title, body, and labels", () => {
    const payload = buildIssuePayload(
      baseResult,
      "owner/repo",
      "main",
      "abcdef0",
    );
    assert.equal(payload.title, baseResult.issueTitle);
    assert.ok(payload.body.includes("owner/repo"));
    assert.ok(payload.body.includes("main"));
    assert.ok(payload.body.includes("Findings by kind"));
    assert.deepEqual(payload.labels, [
      "entropy-janitor/doc-drift",
      "tech-debt",
    ]);
  });

  it("truncates long finding lists", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      kind: "missing-file" as const,
      path: `docs/file${i}.md`,
      message: `missing file ${i}`,
      severity: "error" as const,
    }));
    const result: JanitorResult = {
      ...baseResult,
      report: { ...baseReport, findings: many },
    };
    const payload = buildIssuePayload(result, "owner/repo", "main", "abcdef0");
    assert.ok(payload.body.includes("and 150 more"));
  });
});

describe("output.printCliSummary", () => {
  it("writes a single-line summary to stdout", () => {
    const captured: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      captured.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };
    try {
      printCliSummary(baseResult, { root: ".", dryRun: true, json: false });
    } finally {
      process.stdout.write = original;
    }
    const out = captured.join("");
    assert.ok(out.includes("doc-drift"));
    assert.ok(out.includes("scanned=100"));
  });
});

describe("redact", () => {
  it("scrubs GitHub PATs as raw string values", () => {
    const out = redact("ghp_abcdef0123456789abcdef0123456789abcd");
    assert.equal(out, "[redacted:github-pat]");
  });

  it("redacts fields whose key contains token", () => {
    const out = redact({ secret: "leaked-value" });
    assert.equal((out as Record<string, unknown>).secret, "[redacted]");
  });

  it("preserves non-sensitive keys", () => {
    const out = redact({ name: "x" });
    assert.equal((out as Record<string, unknown>).name, "x");
  });
});
