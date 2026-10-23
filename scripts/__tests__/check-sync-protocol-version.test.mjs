// Тести гейта `scripts/check-sync-protocol-version.mjs` (аудит data-48).
//
// Run with:  node --test scripts/__tests__/check-sync-protocol-version.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluate,
  extractProtocolVersion,
  extractRegistryTables,
  readCurrent,
  serializeSnapshot,
} from "../check-sync-protocol-version.mjs";

const REGISTRY = (extra = "") => `
const X = { a_b: 1 };
const OP_LOG_TABLE_REGISTRY: Record<string, ApplyFn> = {
  routine_entries: applyRoutineEntries,
  // коментар: not_a_table: x
  finyk_budgets: perRowBlob("finyk_budgets"),
${extra}};
export const INCREMENT_OP_SUPPORTED_TABLES = new Set();
`;
const VERSION = (n) => `export const SYNC_PROTOCOL_VERSION = ${n};`;
const SNAP = { version: 1, tables: ["finyk_budgets", "routine_entries"] };

function cur(extra, v) {
  return {
    version: extractProtocolVersion(VERSION(v)),
    tables: extractRegistryTables(REGISTRY(extra)),
  };
}

test("парс ключів ігнорує коментарі та сторонні об'єкти", () => {
  assert.deepEqual(extractRegistryTables(REGISTRY()), SNAP.tables);
});

test("без змін -> ok", () => {
  assert.deepEqual(evaluate(cur("", 1), SNAP), []);
});

test("таблиця додана без бампу -> fail", () => {
  const errs = evaluate(cur("  nutrition_new: applyX,\n", 1), SNAP);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /nutrition_new/);
  assert.match(errs[0], /SYNC_PROTOCOL_VERSION/);
});

test("бамп і оновлений знімок -> ok", () => {
  const c = cur("  nutrition_new: applyX,\n", 2);
  assert.deepEqual(evaluate(c, JSON.parse(serializeSnapshot(c))), []);
});

test("бамп без оновлення знімка -> fail (--update)", () => {
  const errs = evaluate(cur("  nutrition_new: applyX,\n", 2), SNAP);
  assert.match(errs[0], /--update/);
});

test("зниження версії -> fail", () => {
  assert.match(evaluate(cur("", 1), { ...SNAP, version: 3 })[0], /не знижують/);
});

test("закомічений знімок збігається з реальним реєстром", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const snap = JSON.parse(
    readFileSync(
      join(root, "scripts/__fixtures__/sync-protocol-tables.json"),
      "utf8",
    ),
  );
  assert.deepEqual(evaluate(readCurrent(root), snap), []);
});
