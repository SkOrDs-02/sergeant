#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_LEDGER = "docs/90-work/audits/user-story-ledger.csv";

const requiredColumns = [
  "feature_id",
  "surface",
  "source",
  "route_or_entry",
  "feature",
  "user_story",
  "expected_behavior",
  "status",
  "discovery_evidence",
  "test_type",
  "test_status",
  "error_ids",
  "fix_status",
  "retest_status",
  "owner_skill",
  "last_updated",
  "notes",
];

const allowedSurface = new Set(["web", "server", "mobile", "openclaw"]);
const allowedStatus = new Set([
  "discovered",
  "story_drafted",
  "test_ready",
  "tested_passed",
  "tested_failed",
  "blocked",
  "fixed",
  "retested_passed",
]);
const allowedTestStatus = new Set(["pending", "passed", "failed", "blocked"]);
const allowedFixStatus = new Set(["not_started", "not_fixable", "fixed"]);
const allowedRetestStatus = new Set([
  "not_started",
  "passed",
  "failed",
  "blocked",
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (quoted) {
    throw new Error("CSV ended inside a quoted field");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.length > 0));
}

function fail(message, errors) {
  errors.push(message);
}

function validate(filePath) {
  const absolutePath = resolve(filePath);
  const parsed = parseCsv(readFileSync(absolutePath, "utf8"));
  const [header, ...rows] = parsed;
  const errors = [];

  if (!header) {
    throw new Error("Ledger is empty");
  }

  const headerLine = header.join(",");
  const expectedHeader = requiredColumns.join(",");
  if (headerLine !== expectedHeader) {
    fail(`Header mismatch. Expected: ${expectedHeader}`, errors);
  }

  const seen = new Set();
  for (const [index, values] of rows.entries()) {
    const line = index + 2;
    if (values.length !== requiredColumns.length) {
      fail(
        `Line ${line}: expected ${requiredColumns.length} columns, got ${values.length}`,
        errors,
      );
      continue;
    }

    const row = Object.fromEntries(
      requiredColumns.map((key, columnIndex) => [
        key,
        values[columnIndex] ?? "",
      ]),
    );

    for (const key of [
      "feature_id",
      "surface",
      "source",
      "route_or_entry",
      "feature",
      "user_story",
      "expected_behavior",
      "status",
      "discovery_evidence",
      "test_type",
      "test_status",
      "fix_status",
      "retest_status",
      "owner_skill",
      "last_updated",
    ]) {
      if (!row[key]?.trim()) {
        fail(`Line ${line}: ${key} is required`, errors);
      }
    }

    if (seen.has(row.feature_id)) {
      fail(`Line ${line}: duplicate feature_id ${row.feature_id}`, errors);
    }
    seen.add(row.feature_id);

    if (!allowedSurface.has(row.surface)) {
      fail(`Line ${line}: unsupported surface ${row.surface}`, errors);
    }
    if (!allowedStatus.has(row.status)) {
      fail(`Line ${line}: unsupported status ${row.status}`, errors);
    }
    if (!allowedTestStatus.has(row.test_status)) {
      fail(`Line ${line}: unsupported test_status ${row.test_status}`, errors);
    }
    if (!allowedFixStatus.has(row.fix_status)) {
      fail(`Line ${line}: unsupported fix_status ${row.fix_status}`, errors);
    }
    if (!allowedRetestStatus.has(row.retest_status)) {
      fail(
        `Line ${line}: unsupported retest_status ${row.retest_status}`,
        errors,
      );
    }

    if (row.test_status === "failed" && !row.error_ids.trim()) {
      fail(`Line ${line}: failed test_status requires error_ids`, errors);
    }
    if (row.fix_status === "fixed" && row.test_status !== "failed") {
      fail(
        `Line ${line}: fixed rows must come from a failed test_status`,
        errors,
      );
    }
    if (row.retest_status === "passed" && row.fix_status !== "fixed") {
      fail(`Line ${line}: passed retest requires fix_status=fixed`, errors);
    }
  }

  return { errors, rows: rows.length, path: absolutePath };
}

const ledgerPath = process.argv[2] ?? DEFAULT_LEDGER;
const result = validate(ledgerPath);

if (result.errors.length > 0) {
  console.error(`user-story-ledger validation failed (${result.path})`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`user-story-ledger ok: ${result.rows} rows (${result.path})`);
