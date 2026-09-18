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

  // Іменований скрипт лишається для окремого запуску…
  assert.equal(
    packageJson.scripts["lint:kvstore-deep-imports"],
    "node scripts/check-kvstore-deep-imports.mjs",
  );
  // …а в ЛАНЦЮЖКУ `pnpm lint` виклик іде напряму `node …`, не через
  // обгортку `pnpm lint:…`: за AGENTS.md § «Verification before PR»
  // обгортка коштувала ~760 мс на виклик, 22 с на 29 викликів, і
  // ланцюжок свідомо перевели на прямі виклики. Тест перевіряв стару
  // форму, тобто вимагав повернути знятий борг, — і цього ніхто не
  // бачив, бо глоб `scripts/__tests__` у CI не виконувався.
  assert.match(
    packageJson.scripts.lint,
    /\bnode scripts\/check-kvstore-deep-imports\.mjs\b/,
  );
});
