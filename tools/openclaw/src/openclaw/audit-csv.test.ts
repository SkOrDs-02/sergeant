import { describe, expect, it } from "vitest";
import {
  buildAuditCsvFilename,
  renderWriteAuditCsv,
  type WriteAuditCsvRow,
} from "./audit-csv.js";

/**
 * Unit-tests for the `/audit … csv` document body and filename.
 *
 * We cover the RFC-4180 quoting corners explicitly because the founder
 * may forward the file to other tools (Google Sheets, Excel, Numbers)
 * which differ on how loosely they accept malformed CSV. Anything that
 * needs quoting MUST be quoted; nothing else should be.
 */

function row(overrides: Partial<WriteAuditCsvRow> = {}): WriteAuditCsvRow {
  return {
    recorded_at: "2026-05-03T10:00:00.000Z",
    tool: "post_to_topic",
    action: "executed",
    persona: "ops",
    http_status: 200,
    approval_id: "abc12345",
    ...overrides,
  };
}

describe("renderWriteAuditCsv", () => {
  it("emits the header row with the documented column-set in fixed order", () => {
    const out = renderWriteAuditCsv([]);
    expect(out).toBe(
      "recorded_at,tool,action,persona,http_status,approval_id\r\n",
    );
  });

  it("renders a happy-path row with no quoting needed", () => {
    const out = renderWriteAuditCsv([row()]);
    const lines = out.split("\r\n");
    expect(lines[0]).toBe(
      "recorded_at,tool,action,persona,http_status,approval_id",
    );
    expect(lines[1]).toBe(
      "2026-05-03T10:00:00.000Z,post_to_topic,executed,ops,200,abc12345",
    );
    // RFC-4180 trailing CRLF.
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("renders multiple rows newest-first preserving caller order", () => {
    const out = renderWriteAuditCsv([
      row({ approval_id: "newest" }),
      row({ approval_id: "older" }),
    ]);
    const lines = out.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain("newest");
    expect(lines[2]).toContain("older");
  });

  it("emits empty cells for null persona / http_status", () => {
    const out = renderWriteAuditCsv([
      row({ persona: null, http_status: null }),
    ]);
    const lines = out.trimEnd().split("\r\n");
    expect(lines[1]).toBe(
      "2026-05-03T10:00:00.000Z,post_to_topic,executed,,,abc12345",
    );
  });

  it("quotes values containing commas", () => {
    const out = renderWriteAuditCsv([row({ tool: "tool,with,commas" })]);
    expect(out).toContain('"tool,with,commas"');
  });

  it("quotes values containing double-quotes and doubles them", () => {
    const out = renderWriteAuditCsv([row({ persona: 'has"quote' })]);
    expect(out).toContain('"has""quote"');
  });

  it("quotes values containing newlines (CR/LF)", () => {
    const out = renderWriteAuditCsv([
      row({ approval_id: "line1\nline2" }),
      row({ approval_id: "line3\r\nline4" }),
    ]);
    expect(out).toContain('"line1\nline2"');
    expect(out).toContain('"line3\r\nline4"');
  });

  it("preserves zero values (does not coerce 0 → empty)", () => {
    // Defensive — 0 is a valid HTTP status in tests / mocks even though
    // not real-world, and we never want to silently elide it.
    const out = renderWriteAuditCsv([row({ http_status: 0 })]);
    const lines = out.trimEnd().split("\r\n");
    expect(lines[1]?.split(",")[4]).toBe("0");
  });
});

describe("buildAuditCsvFilename", () => {
  it("uses the openclaw-audit prefix and a sortable compact timestamp", () => {
    const t = new Date("2026-05-03T12:34:56.789Z");
    expect(buildAuditCsvFilename(t)).toBe(
      "openclaw-audit-20260503T123456Z.csv",
    );
  });

  it("strips dashes and colons but retains the Z marker", () => {
    const t = new Date("2026-12-31T23:59:59.000Z");
    const fn = buildAuditCsvFilename(t);
    expect(fn).toMatch(/^openclaw-audit-\d{8}T\d{6}Z\.csv$/);
    expect(fn).toContain("Z");
  });

  it("sorts lexicographically in chronological order", () => {
    const a = buildAuditCsvFilename(new Date("2026-01-01T00:00:00Z"));
    const b = buildAuditCsvFilename(new Date("2026-06-01T00:00:00Z"));
    const c = buildAuditCsvFilename(new Date("2027-01-01T00:00:00Z"));
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });
});
