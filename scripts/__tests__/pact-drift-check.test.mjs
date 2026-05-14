// scripts/__tests__/pact-drift-check.test.mjs
//
// Unit-tests for the pure diff-engine bits of `scripts/pact-drift-check.mjs`.
// We deliberately do not exercise the HTTP runner in the test — that's
// covered (at smoke level) by the cron workflow itself running against
// staging once a day. Here we lock in the schema-shape invariants:
//
//   • Primitives compare by JS typeof; "null" is distinct from "string"
//     so a nullable column going non-null counts as a type mismatch.
//   • Missing fields are FAIL; extra fields are WARN; type swaps are FAIL.
//   • Arrays merge their element shapes — empty arrays on either side
//     produce WARN-level signals (data drift, not schema drift).
//
// Run with:  node --test scripts/__tests__/pact-drift-check.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractShape,
  diffShape,
  loadPactFiles,
} from "../pact-drift-check.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("extractShape — primitives", () => {
  assert.equal(extractShape(null), "null");
  assert.equal(extractShape(true), "boolean");
  assert.equal(extractShape(42), "number");
  assert.equal(extractShape("hello"), "string");
});

test("extractShape — flat object", () => {
  const shape = extractShape({ id: "u1", count: 7, ok: true });
  assert.deepEqual(shape, {
    kind: "object",
    props: { id: "string", count: "number", ok: "boolean" },
  });
});

test("extractShape — nested object + array", () => {
  const shape = extractShape({
    user: { id: "u1", roles: ["admin", "ops"] },
    items: [{ sku: "abc", qty: 2 }],
  });
  assert.deepEqual(shape, {
    kind: "object",
    props: {
      user: {
        kind: "object",
        props: {
          id: "string",
          roles: { kind: "array", items: "string" },
        },
      },
      items: {
        kind: "array",
        items: {
          kind: "object",
          props: { sku: "string", qty: "number" },
        },
      },
    },
  });
});

test("extractShape — empty array surfaces null items", () => {
  assert.deepEqual(extractShape([]), { kind: "array", items: null });
});

test("diffShape — identical shapes produce no diffs", () => {
  const s = extractShape({ id: "u1", n: 1 });
  assert.deepEqual(diffShape(s, s), []);
});

test("diffShape — missing field is FAIL", () => {
  const expected = extractShape({ id: "u1", email: "x@y" });
  const actual = extractShape({ id: "u1" });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, "fail");
  assert.equal(diffs[0].kind, "missing_field");
  assert.equal(diffs[0].path, "$.email");
});

test("diffShape — extra field is WARN", () => {
  const expected = extractShape({ id: "u1" });
  const actual = extractShape({ id: "u1", extra: "new" });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, "warn");
  assert.equal(diffs[0].kind, "extra_field");
  assert.equal(diffs[0].path, "$.extra");
});

test("diffShape — type swap (string -> number) is FAIL", () => {
  const expected = extractShape({ count: "7" });
  const actual = extractShape({ count: 7 });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, "fail");
  assert.equal(diffs[0].kind, "type_mismatch");
  assert.equal(diffs[0].expected, "string");
  assert.equal(diffs[0].actual, "number");
});

test("diffShape — null vs string is FAIL (nullable -> non-null counts)", () => {
  const expected = extractShape({ image: null });
  const actual = extractShape({ image: "https://example.com/a.png" });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, "fail");
  assert.equal(diffs[0].kind, "type_mismatch");
});

test("diffShape — object vs array is FAIL", () => {
  const expected = extractShape({ rows: { a: 1 } });
  const actual = extractShape({ rows: [{ a: 1 }] });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, "fail");
  assert.equal(diffs[0].kind, "kind_mismatch");
});

test("diffShape — nested missing field path resolves correctly", () => {
  const expected = extractShape({ user: { id: "u1", email: "x" } });
  const actual = extractShape({ user: { id: "u1" } });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].path, "$.user.email");
  assert.equal(diffs[0].kind, "missing_field");
});

test("diffShape — array element shape divergence is FAIL", () => {
  const expected = extractShape({ rows: [{ a: "x" }] });
  const actual = extractShape({ rows: [{ b: "y" }] });
  const diffs = diffShape(expected, actual);
  // $.rows[*].a missing (fail) + $.rows[*].b extra (warn).
  const fails = diffs.filter((d) => d.severity === "fail");
  const warns = diffs.filter((d) => d.severity === "warn");
  assert.equal(fails.length, 1);
  assert.equal(fails[0].path, "$.rows[*].a");
  assert.equal(warns.length, 1);
  assert.equal(warns[0].path, "$.rows[*].b");
});

test("diffShape — empty array on live side is WARN (data drift)", () => {
  const expected = extractShape({ rows: [{ a: "x" }] });
  const actual = extractShape({ rows: [] });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, "warn");
  assert.equal(diffs[0].kind, "array_now_empty");
});

test("diffShape — empty array in pact + populated live is WARN", () => {
  const expected = extractShape({ rows: [] });
  const actual = extractShape({ rows: [{ a: "x" }] });
  const diffs = diffShape(expected, actual);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].severity, "warn");
  assert.equal(diffs[0].kind, "array_now_populated");
});

test("loadPactFiles — parses real pact-v3 shape", () => {
  const dir = mkdtempSync(join(tmpdir(), "pact-drift-test-"));
  try {
    const pactPath = join(dir, "fake.json");
    writeFileSync(
      pactPath,
      JSON.stringify({
        consumer: { name: "test-consumer" },
        provider: { name: "test-provider" },
        interactions: [
          {
            description: "a fake GET",
            request: { method: "GET", path: "/api/x" },
            response: { status: 200, body: { ok: true } },
          },
        ],
      }),
      "utf-8",
    );
    const interactions = loadPactFiles([pactPath]);
    assert.equal(interactions.length, 1);
    assert.equal(interactions[0].consumer, "test-consumer");
    assert.equal(interactions[0].provider, "test-provider");
    assert.equal(interactions[0].request.path, "/api/x");
    assert.equal(interactions[0].response.status, 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadPactFiles — rejects pact without interactions array", () => {
  const dir = mkdtempSync(join(tmpdir(), "pact-drift-test-"));
  try {
    const pactPath = join(dir, "bad.json");
    writeFileSync(
      pactPath,
      JSON.stringify({ consumer: { name: "x" }, provider: { name: "y" } }),
      "utf-8",
    );
    assert.throws(() => loadPactFiles([pactPath]), /interactions/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
