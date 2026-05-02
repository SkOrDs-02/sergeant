// scripts/docs/__tests__/check-adr-graph.test.mjs
//
// Unit + integration tests for the ADR graph validator.
// Pure helpers (`extractField`, `parseAdr`, `listIndexedNumbers`,
// `validateGraph`) are tested with synthetic fixtures; one integration
// test runs against the real on-disk ADR set so the script catches
// drift between code and docs.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractField,
  parseAdr,
  listIndexedNumbers,
  validateGraph,
  listAdrFiles,
  findNumberingGaps,
  KNOWN_NUMBERING_GAPS,
} from "../check-adr-graph.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const ADR_DIR = resolve(REPO_ROOT, "docs/adr");
const README_PATH = resolve(ADR_DIR, "README.md");

const sample = ({ status, supersedes, lang = "en" }) => {
  const statusKey = lang === "uk" ? "Статус" : "Status";
  const supKey = lang === "uk" ? "Замінює" : "Supersedes";
  return [
    "# ADR-0042: Sample",
    "",
    `- **${statusKey}:** ${status}`,
    "- **Date:** 2026-04-30",
    "- **Reviewers:** @Skords-01",
    `- **${supKey}:** ${supersedes}`,
    "- **Related:** —",
    "",
    "## Context",
    "Body.",
  ].join("\n");
};

// ── extractField ─────────────────────────────────────────────────────────────

test("extractField: pulls the English value", () => {
  const c = sample({ status: "accepted", supersedes: "—" });
  assert.equal(extractField(c, ["Status"]), "accepted");
});

test("extractField: pulls the Ukrainian value when given alias", () => {
  const c = sample({ status: "accepted", supersedes: "—", lang: "uk" });
  assert.equal(extractField(c, ["Status", "Статус"]), "accepted");
});

test("extractField: returns null if absent", () => {
  assert.equal(extractField("# Foo\n\n- **Other:** x", ["Status"]), null);
});

// ── parseAdr ─────────────────────────────────────────────────────────────────

test("parseAdr: accepts an `accepted` ADR with no supersedes", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  assert.equal(r.number, "0042");
  assert.equal(r.status, "accepted");
  assert.deepEqual(r.supersedeTargets, []);
  assert.equal(r.supersededBy, null);
  assert.deepEqual(r.errors, []);
});

test("parseAdr: parses 'Superseded by ADR-0010'", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({ status: "Superseded by ADR-0010", supersedes: "—" }),
  );
  assert.equal(r.status, "superseded");
  assert.equal(r.supersededBy, "0010");
  assert.deepEqual(r.errors, []);
});

test("parseAdr: parses 'Supersedes: ADR-0005'", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({ status: "accepted", supersedes: "ADR-0005" }),
  );
  assert.deepEqual(r.supersedeTargets, ["0005"]);
});

test("parseAdr: parses multiple supersede targets", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({ status: "accepted", supersedes: "ADR-0005, ADR-0006" }),
  );
  assert.deepEqual(r.supersedeTargets, ["0005", "0006"]);
});

test("parseAdr: tolerates Ukrainian field names", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({ status: "accepted", supersedes: "—", lang: "uk" }),
  );
  assert.equal(r.status, "accepted");
  assert.deepEqual(r.errors, []);
});

test("parseAdr: tolerates HTML-comment placeholder in Status", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({
      status:
        "accepted <!-- Proposed | Accepted | Deprecated | Superseded by ADR-NNNN -->",
      supersedes: "—",
    }),
  );
  assert.equal(r.status, "accepted");
  assert.deepEqual(r.errors, []);
});

test("parseAdr: rejects unknown status", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({ status: "bogus", supersedes: "—" }),
  );
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /unknown status/);
});

test("parseAdr: rejects bad filename", () => {
  const r = parseAdr(
    "/x/foo.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  assert.equal(r.number, null);
  assert.match(r.errors[0], /filename does not match/);
});

test("parseAdr: rejects superseded with no ADR-NNNN reference", () => {
  const r = parseAdr(
    "/x/0042-foo.md",
    sample({ status: "Superseded by something", supersedes: "—" }),
  );
  assert.match(r.errors[0], /no single ADR-NNNN reference/);
});

// ── listIndexedNumbers ───────────────────────────────────────────────────────

test("listIndexedNumbers: extracts from a markdown table column", () => {
  const md = `
| #    | Назва         |
| ---- | ------------- |
| 0001 | First         |
| 0002 | Second        |
| 0099 | Last          |
`;
  const set = listIndexedNumbers(md);
  assert.deepEqual([...set].sort(), ["0001", "0002", "0099"]);
});

test("listIndexedNumbers: ignores 4-digit numbers in body prose", () => {
  const md = `Body text mentions 1234 in passing.\n\n| 0001 | x |\n`;
  const set = listIndexedNumbers(md);
  assert.deepEqual([...set], ["0001"]);
});

// ── validateGraph ────────────────────────────────────────────────────────────

test("validateGraph: green for two unrelated `accepted` ADRs both indexed", () => {
  const a = parseAdr(
    "/x/0001-a.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const b = parseAdr(
    "/x/0002-b.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const errors = validateGraph([a, b], new Set(["0001", "0002"]));
  assert.deepEqual(errors, []);
});

test("validateGraph: complains when an ADR is missing from the README index", () => {
  const a = parseAdr(
    "/x/0001-a.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const errors = validateGraph([a], new Set([]));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not listed in docs\/adr\/README\.md/);
});

test("validateGraph: enforces bidirectional supersede (forward direction missing)", () => {
  // ADR-0002 says it supersedes 0001, but ADR-0001's status is still "accepted".
  const a = parseAdr(
    "/x/0001-a.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const b = parseAdr(
    "/x/0002-b.md",
    sample({ status: "accepted", supersedes: "ADR-0001" }),
  );
  const errors = validateGraph([a, b], new Set(["0001", "0002"]));
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /claims to supersede ADR-0001.*expected "Superseded by ADR-0002"/s,
  );
});

test("validateGraph: enforces bidirectional supersede (reverse direction missing)", () => {
  // ADR-0001 says superseded by 0002, but 0002 doesn't list 0001 in Supersedes.
  const a = parseAdr(
    "/x/0001-a.md",
    sample({ status: "Superseded by ADR-0002", supersedes: "—" }),
  );
  const b = parseAdr(
    "/x/0002-b.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const errors = validateGraph([a, b], new Set(["0001", "0002"]));
  assert.ok(
    errors.some((e) => /Supersedes field does not list ADR-0001/.test(e)),
    `expected reverse-direction error, got: ${JSON.stringify(errors)}`,
  );
});

test("validateGraph: green for a valid supersede pair", () => {
  const a = parseAdr(
    "/x/0001-a.md",
    sample({ status: "Superseded by ADR-0002", supersedes: "—" }),
  );
  const b = parseAdr(
    "/x/0002-b.md",
    sample({ status: "accepted", supersedes: "ADR-0001" }),
  );
  const errors = validateGraph([a, b], new Set(["0001", "0002"]));
  assert.deepEqual(errors, []);
});

test("validateGraph: complains when supersede target doesn't exist", () => {
  const a = parseAdr(
    "/x/0042-a.md",
    sample({ status: "accepted", supersedes: "ADR-9999" }),
  );
  const errors = validateGraph([a], new Set(["0042"]));
  assert.ok(errors.some((e) => /Supersedes ADR-9999 but no such ADR/.test(e)));
});

test("validateGraph: complains when supersede target points to wrong ADR (mismatch)", () => {
  // 0001 says it's superseded by 0002, but 0003 also claims to supersede 0001.
  const a = parseAdr(
    "/x/0001-a.md",
    sample({ status: "Superseded by ADR-0002", supersedes: "—" }),
  );
  const b = parseAdr(
    "/x/0002-b.md",
    sample({ status: "accepted", supersedes: "ADR-0001" }),
  );
  const c = parseAdr(
    "/x/0003-c.md",
    sample({ status: "accepted", supersedes: "ADR-0001" }),
  );
  const errors = validateGraph([a, b, c], new Set(["0001", "0002", "0003"]));
  // 0003 claims to supersede 0001 but 0001 points to 0002 → mismatch.
  assert.ok(
    errors.some((e) => /points to ADR-0002 \(mismatch\)/.test(e)),
    `expected mismatch error, got: ${JSON.stringify(errors)}`,
  );
});

// ── findNumberingGaps ────────────────────────────────────────────────────────

test("findNumberingGaps: empty input returns empty list", () => {
  assert.deepEqual(findNumberingGaps([], new Set()), []);
});

test("findNumberingGaps: contiguous range has no gaps", () => {
  const adrs = [{ number: "0001" }, { number: "0002" }, { number: "0003" }];
  assert.deepEqual(findNumberingGaps(adrs, new Set()), []);
});

test("findNumberingGaps: single missing number is reported", () => {
  const adrs = [{ number: "0001" }, { number: "0003" }];
  assert.deepEqual(findNumberingGaps(adrs, new Set()), ["0002"]);
});

test("findNumberingGaps: respects the known-gap allowlist", () => {
  const adrs = [{ number: "0001" }, { number: "0003" }];
  assert.deepEqual(findNumberingGaps(adrs, new Set(["0002"])), []);
});

test("findNumberingGaps: reports multiple gaps in a range", () => {
  const adrs = [{ number: "0001" }, { number: "0005" }];
  assert.deepEqual(findNumberingGaps(adrs, new Set()), [
    "0002",
    "0003",
    "0004",
  ]);
});

test("findNumberingGaps: pads numbers to 4 digits", () => {
  const adrs = [{ number: "0001" }, { number: "0011" }];
  const gaps = findNumberingGaps(adrs, new Set());
  for (const g of gaps) {
    assert.equal(g.length, 4);
  }
});

test("findNumberingGaps: ignores entries without a number", () => {
  const adrs = [{ number: null }, { number: "0001" }, { number: "0002" }];
  assert.deepEqual(findNumberingGaps(adrs, new Set()), []);
});

test("KNOWN_NUMBERING_GAPS: 0029 is permanently whitelisted", () => {
  // Guard test — ensure the runtime allowlist still contains the
  // documented gap. If someone deletes 0029 from the set, this test
  // forces them to read the comment and update README in the same PR.
  assert.ok(KNOWN_NUMBERING_GAPS.has("0029"));
});

test("validateGraph: flags an undocumented numbering gap", () => {
  const a = parseAdr(
    "/x/0001-a.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const c = parseAdr(
    "/x/0003-c.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const errors = validateGraph([a, c], new Set(["0001", "0003"]));
  assert.ok(
    errors.some((e) => /numbering gap: ADR-0002/.test(e)),
    `expected gap error, got: ${JSON.stringify(errors)}`,
  );
});

test("validateGraph: does NOT flag a whitelisted gap (0029)", () => {
  // Build a synthetic graph that has 0028 + 0030 + 0031 but no 0029,
  // mirroring the on-disk situation. Should pass cleanly.
  const a = parseAdr(
    "/x/0028-a.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const b = parseAdr(
    "/x/0030-b.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const c = parseAdr(
    "/x/0031-c.md",
    sample({ status: "accepted", supersedes: "—" }),
  );
  const errors = validateGraph([a, b, c], new Set(["0028", "0030", "0031"]));
  // No gap error — 0029 is whitelisted in KNOWN_NUMBERING_GAPS.
  assert.ok(
    !errors.some((e) => /numbering gap/.test(e)),
    `unexpected gap error: ${JSON.stringify(errors)}`,
  );
});

// ── On-disk integration ──────────────────────────────────────────────────────

test("on-disk: every ADR file in docs/adr/ parses cleanly", () => {
  const files = listAdrFiles(ADR_DIR);
  assert.ok(files.length >= 27, `expected ≥27 ADRs, got ${files.length}`);
  for (const f of files) {
    const r = parseAdr(f, readFileSync(f, "utf8"));
    assert.deepEqual(
      r.errors,
      [],
      `${f} has parse errors: ${JSON.stringify(r.errors)}`,
    );
  }
});

test("on-disk: validateGraph passes against the real docs/adr tree", () => {
  const files = listAdrFiles(ADR_DIR);
  const adrs = files.map((f) => parseAdr(f, readFileSync(f, "utf8")));
  const indexed = listIndexedNumbers(readFileSync(README_PATH, "utf8"));
  const errors = validateGraph(adrs, indexed);
  assert.deepEqual(
    errors,
    [],
    `unexpected graph errors:\n${errors.join("\n")}`,
  );
});

test("on-disk: README.md ↔ ADR file count parity", () => {
  // every indexed number must have a matching ADR file and vice versa.
  const files = readdirSync(ADR_DIR).filter((f) => /^\d{4}-/.test(f));
  const fileNumbers = new Set(files.map((f) => f.slice(0, 4)));
  const indexed = listIndexedNumbers(readFileSync(README_PATH, "utf8"));
  assert.deepEqual([...fileNumbers].sort(), [...indexed].sort());
});
