// scripts/__tests__/lint-pii-handling-drift.test.mjs
//
// Run with: node --test scripts/__tests__/lint-pii-handling-drift.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractSourceKeys,
  extractDocKeys,
  diffKeys,
  SOURCE_PATH,
  DOC_PATH,
} from "../lint-pii-handling-drift.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("extractSourceKeys pulls the quoted entries from the array literal", () => {
  const source = `
export const REDACT_KEY_NAMES: readonly string[] = [
  "password",
  "token",
  "email",
];
`;
  assert.deepEqual(extractSourceKeys(source), ["password", "token", "email"]);
});

test("extractSourceKeys throws when the array literal is missing", () => {
  assert.throws(() => extractSourceKeys("const x = 1;"));
});

test("extractDocKeys pulls backtick tokens from the marked block only", () => {
  const doc = [
    "intro `notme`",
    "<!-- pii-keys-start -->",
    "`password`, `token`, `email`",
    "<!-- pii-keys-end -->",
    "outro `alsonotme`",
  ].join("\n");
  assert.deepEqual(extractDocKeys(doc), ["password", "token", "email"]);
});

test("extractDocKeys throws when markers are missing", () => {
  assert.throws(() => extractDocKeys("no markers here"));
});

test("diffKeys reports a clean match", () => {
  const r = diffKeys(["a", "b"], ["b", "a"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.missingInDoc, []);
  assert.deepEqual(r.extraInDoc, []);
});

test("diffKeys flags a key dropped from the doc (the S10 acceptance case)", () => {
  // Simulate someone adding a key to shared but forgetting the doc.
  const r = diffKeys(["password", "token", "newKey"], ["password", "token"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missingInDoc, ["newKey"]);
});

test("diffKeys flags a stale doc-only key", () => {
  const r = diffKeys(["password"], ["password", "removedKey"]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.extraInDoc, ["removedKey"]);
});

test("real repo files are in sync (no drift on main)", () => {
  const source = readFileSync(resolve(REPO_ROOT, SOURCE_PATH), "utf8");
  const doc = readFileSync(resolve(REPO_ROOT, DOC_PATH), "utf8");
  const r = diffKeys(extractSourceKeys(source), extractDocKeys(doc));
  assert.deepEqual(
    { missingInDoc: r.missingInDoc, extraInDoc: r.extraInDoc },
    { missingInDoc: [], extraInDoc: [] },
  );
});
