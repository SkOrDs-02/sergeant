// scripts/__tests__/check-ai-legacy.test.mjs
//
// Unit tests for the AI-LEGACY marker scanner. Run with:
//   node --test scripts/__tests__/check-ai-legacy.test.mjs
//
// The scanner is exercised via its pure helpers — no fs / network — to keep
// the suite hermetic. The CLI integration is covered indirectly by CI on the
// real repo (the `lint:ai-legacy` script).

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyExpiry,
  daysBetween,
  extractIssueRef,
  extractMalformed,
  extractMarkers,
  legacyIssueBody,
  legacyIssueMarker,
  legacyIssueTitle,
  renderHtml,
  todayISO,
} from "../check-ai-legacy.mjs";

// ── extractMarkers ───────────────────────────────────────────────────────────

describe("extractMarkers", () => {
  it("extracts a single canonical line marker", () => {
    const src = `// AI-LEGACY: expires 2026-06-01. Auto-migrates finyk_token.\nconst x = 1;\n`;
    assert.deepEqual(extractMarkers(src), [
      {
        line: 1,
        expires: "2026-06-01",
        note: "Auto-migrates finyk_token.",
      },
    ]);
  });

  it("captures multiple markers on different lines", () => {
    const src = [
      "const a = 1;",
      "// AI-LEGACY: expires 2026-01-01. Drop after rollout.",
      "function foo() {",
      "  /* AI-LEGACY: expires 2027-12-31 */",
      "  return 0;",
      "}",
    ].join("\n");
    const got = extractMarkers(src);
    assert.equal(got.length, 2);
    assert.equal(got[0].line, 2);
    assert.equal(got[0].expires, "2026-01-01");
    assert.equal(got[1].line, 4);
    assert.equal(got[1].expires, "2027-12-31");
  });

  it("ignores almost-but-not-quite markers (no expiry token)", () => {
    const src = `// AI-LEGACY: rewrite this later\n`;
    assert.deepEqual(extractMarkers(src), []);
  });

  it("survives the regex being called repeatedly (no stale lastIndex)", () => {
    const src = "// AI-LEGACY: expires 2026-06-01\n";
    extractMarkers(src);
    const second = extractMarkers(src);
    assert.equal(second.length, 1);
  });

  it("extracts marker with empty note", () => {
    const src = "// AI-LEGACY: expires 2026-06-01\n";
    const got = extractMarkers(src);
    assert.equal(got.length, 1);
    assert.equal(got[0].note, "");
  });
});

// ── extractMalformed ─────────────────────────────────────────────────────────

describe("extractMalformed", () => {
  it("flags AI-LEGACY without an `expires YYYY-MM-DD` clause", () => {
    const src = "// AI-LEGACY: rewrite this later\n";
    const got = extractMalformed(src);
    assert.equal(got.length, 1);
    assert.equal(got[0].line, 1);
    assert.match(got[0].snippet, /AI-LEGACY/);
  });

  it("does not double-flag well-formed markers", () => {
    const src =
      "// AI-LEGACY: expires 2026-06-01. Migrate transactions table.\n";
    assert.deepEqual(extractMalformed(src), []);
  });

  it("returns nothing when the file has no AI-LEGACY token at all", () => {
    assert.deepEqual(extractMalformed("const x = 1;\n"), []);
  });
});

// ── classifyExpiry ───────────────────────────────────────────────────────────

describe("classifyExpiry", () => {
  const today = "2026-04-30";

  it("returns 'expired' when expires < today", () => {
    assert.equal(classifyExpiry("2026-04-29", { today }), "expired");
  });

  it("returns 'expired' for very old dates", () => {
    assert.equal(classifyExpiry("2024-01-01", { today }), "expired");
  });

  it("returns 'due-soon' inside the default 14d window", () => {
    assert.equal(classifyExpiry("2026-05-01", { today }), "due-soon");
    assert.equal(classifyExpiry("2026-05-14", { today }), "due-soon");
  });

  it("returns 'fresh' beyond the due-soon window", () => {
    assert.equal(classifyExpiry("2026-06-01", { today }), "fresh");
  });

  it("respects a custom dueSoonDays", () => {
    assert.equal(
      classifyExpiry("2026-05-20", { today, dueSoonDays: 30 }),
      "due-soon",
    );
    assert.equal(
      classifyExpiry("2026-05-20", { today, dueSoonDays: 7 }),
      "fresh",
    );
  });
});

// ── daysBetween ──────────────────────────────────────────────────────────────

describe("daysBetween", () => {
  it("computes positive days for a future date", () => {
    assert.equal(daysBetween("2026-04-30", "2026-05-10"), 10);
  });
  it("computes negative days for a past date", () => {
    assert.equal(daysBetween("2026-04-30", "2026-04-29"), -1);
  });
  it("returns 0 for the same date", () => {
    assert.equal(daysBetween("2026-04-30", "2026-04-30"), 0);
  });
});

// ── todayISO ─────────────────────────────────────────────────────────────────

describe("todayISO", () => {
  it("returns YYYY-MM-DD in UTC", () => {
    const fixed = new Date("2026-04-30T15:00:00Z");
    assert.equal(todayISO(fixed), "2026-04-30");
  });
});

// ── Issue helpers ────────────────────────────────────────────────────────────

describe("legacyIssueMarker / legacyIssueTitle / legacyIssueBody", () => {
  it("marker includes file:line:expires for idempotency", () => {
    assert.equal(
      legacyIssueMarker("apps/web/src/foo.ts", 42, "2026-06-01"),
      "<!-- ai-legacy:apps/web/src/foo.ts:42:2026-06-01 -->",
    );
  });

  it("title contains the file+line and expiry", () => {
    const t = legacyIssueTitle("apps/server/src/x.ts", 7, "2026-01-01");
    assert.match(t, /apps\/server\/src\/x\.ts:7/);
    assert.match(t, /2026-01-01/);
  });

  it("body embeds the marker and a deep-link to the line", () => {
    const body = legacyIssueBody(
      "apps/web/src/foo.ts",
      42,
      "2026-06-01",
      "Migrate after Mono v2",
      30,
    );
    assert.match(
      body,
      /<!-- ai-legacy:apps\/web\/src\/foo\.ts:42:2026-06-01 -->/,
    );
    assert.match(body, /apps\/web\/src\/foo\.ts:42/);
    assert.match(body, /#L42/);
    assert.match(body, /30 days ago/);
    assert.match(body, /Migrate after Mono v2/);
  });

  it("body singularises the day suffix at exactly 1 day", () => {
    const body = legacyIssueBody("apps/web/src/foo.ts", 1, "2026-04-29", "", 1);
    assert.match(body, /1 day ago/);
    assert.doesNotMatch(body, /1 days ago/);
  });
});

// ── extractIssueRef ──────────────────────────────────────────────────────────

describe("extractIssueRef", () => {
  it("returns bare issue number (#123)", () => {
    assert.equal(extractIssueRef("migrate bearer token #456"), "#456");
  });

  it("returns GH-NNN shorthand", () => {
    assert.equal(extractIssueRef("tracked in GH-789"), "GH-789");
  });

  it("returns issues/NNN path fragment (from full GitHub URL)", () => {
    assert.equal(
      extractIssueRef("https://github.com/Skords-01/Sergeant/issues/123"),
      "issues/123",
    );
  });

  it("returns null for empty note", () => {
    assert.equal(extractIssueRef(""), null);
    assert.equal(extractIssueRef(null), null);
  });

  it("returns null when no issue reference present", () => {
    assert.equal(extractIssueRef("migrate after v2 rollout"), null);
  });
});

// ── renderHtml ───────────────────────────────────────────────────────────────

describe("renderHtml", () => {
  const findings = [
    {
      file: "apps/web/src/foo.ts",
      line: 10,
      expires: "2026-04-01",
      note: "Migrate Mono",
      status: "expired",
      daysUntilExpiry: -29,
    },
    {
      file: "apps/server/src/bar.ts",
      line: 5,
      expires: "2026-05-10",
      note: "",
      status: "due-soon",
      daysUntilExpiry: 10,
    },
    {
      file: "packages/shared/src/baz.ts",
      line: 1,
      expires: null,
      note: "// AI-LEGACY: cleanup",
      status: "malformed",
      daysUntilExpiry: null,
    },
  ];

  it("includes per-status totals", () => {
    const html = renderHtml(findings, { today: "2026-04-30" });
    assert.match(html, /Expired: 1/);
    assert.match(html, /Due soon: 1/);
    assert.match(html, /Malformed: 1/);
    assert.match(html, /Fresh: 0/);
  });

  it("escapes HTML in note/file fields", () => {
    const html = renderHtml(
      [
        {
          file: "x<y>.ts",
          line: 1,
          expires: "2026-04-01",
          note: "<script>alert(1)</script>",
          status: "expired",
          daysUntilExpiry: -1,
        },
      ],
      { today: "2026-04-02" },
    );
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("renders an empty-state row when no findings", () => {
    const html = renderHtml([], { today: "2026-04-30" });
    assert.match(html, /No AI-LEGACY markers found/);
  });
});
