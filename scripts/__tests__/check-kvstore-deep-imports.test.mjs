import test from "node:test";
import assert from "node:assert/strict";

import { findKvStoreDeepImports } from "../check-kvstore-deep-imports.mjs";

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
