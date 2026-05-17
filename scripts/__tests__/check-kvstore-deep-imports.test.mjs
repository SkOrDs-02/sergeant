import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findKvStoreDeepImports } from "../check-kvstore-deep-imports.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("findKvStoreDeepImports flags direct kvStore imports", () => {
  const hits = findKvStoreDeepImports(
    `import { kvStore } from "@sergeant/shared/lib/kvStore";\n`,
  );
  assert.deepEqual(hits, [
    { line: 1, specifier: "@sergeant/shared/lib/kvStore" },
  ]);
});

test("findKvStoreDeepImports allows kvStoreBoot adapters", () => {
  const hits = findKvStoreDeepImports(
    `import { bootstrapKvStore } from "./core/db/kvStoreBoot.js";\n`,
  );
  assert.deepEqual(hits, []);
});

test("findKvStoreDeepImports flags dynamic kv-store imports", () => {
  const hits = findKvStoreDeepImports(
    `const mod = await import("@sergeant/shared/lib/kv-store/native");\n`,
  );
  assert.deepEqual(hits, [
    { line: 1, specifier: "@sergeant/shared/lib/kv-store/native" },
  ]);
});

test("kvStore deep-import guard is wired into lint", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf8"),
  );

  assert.equal(
    packageJson.scripts["lint:kvstore-deep-imports"],
    "node scripts/check-kvstore-deep-imports.mjs",
  );
  assert.match(packageJson.scripts.lint, /\bpnpm lint:kvstore-deep-imports\b/);
});
