// scripts/__tests__/check-test-orphans.test.mjs
//
// Тести гейта `scripts/check-test-orphans.mjs`: тест-файл поза `include`
// vitest-конфігу воркспейсу (клас `apps/server/scripts/*.test.ts`) ловиться.
//
// Run with:  node --test scripts/__tests__/check-test-orphans.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractVitestIncludes,
  findOrphans,
  globToRegExp,
} from "../check-test-orphans.mjs";

function fixture(config) {
  const root = mkdtempSync(join(tmpdir(), "orphans-"));
  mkdirSync(join(root, "apps", "x"), { recursive: true });
  writeFileSync(join(root, "apps", "x", "vitest.config.ts"), config);
  return root;
}

const CONFIG = `export default { test: { include: ["src/**/*.test.ts"] },
  coverage: { include: ["scripts/**/*.ts"] } };`;

test("coverage.include не рахується як runner", () => {
  assert.deepEqual(extractVitestIncludes(CONFIG), ["src/**/*.test.ts"]);
});

test("тест поза include знаходиться як осиротілий", () => {
  const root = fixture(CONFIG);
  const orphans = findOrphans(
    ["apps/x/src/a.test.ts", "apps/x/scripts/b.test.ts"],
    root,
  );
  assert.deepEqual(orphans, ["apps/x/scripts/b.test.ts"]);
});

test("розширений include прибирає осиротілого", () => {
  const root = fixture(
    `export default { test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"] } };`,
  );
  assert.deepEqual(findOrphans(["apps/x/scripts/b.test.ts"], root), []);
});

test("glob: ** матчить і корінь, і вкладені каталоги", () => {
  const re = globToRegExp("src/**/*.test.ts");
  assert.ok(re.test("src/a.test.ts"));
  assert.ok(re.test("src/a/b/c.test.ts"));
  assert.ok(!re.test("scripts/a.test.ts"));
});
