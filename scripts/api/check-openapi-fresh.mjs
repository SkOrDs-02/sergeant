#!/usr/bin/env node
/**
 * Verifies that `docs/api/openapi.json` matches what the generator
 * produces from the current zod-схеми.
 *
 * Запуск:    `pnpm api:check-openapi` (root) або
 *            `node scripts/api/check-openapi-fresh.mjs`.
 *
 * Поведінка: regenerates spec у пам'яті, читає коммітнутий файл, порівнює.
 *           Несинхронізовано → process.exit(1) з підказкою, що запустити.
 *
 * Використовується у `.github/workflows/openapi-freshness.yml` для PR-gate.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { register } from "tsx/esm/api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

register();

const { buildOpenApiDocument } = await import(
  path.join(repoRoot, "packages/shared/src/openapi/index.ts")
);

const expected = JSON.stringify(buildOpenApiDocument(), null, 2) + "\n";
const file = path.join(repoRoot, "docs", "api", "openapi.json");

let actual = "";
try {
  actual = readFileSync(file, "utf8");
} catch {
  console.error(
    `[openapi-fresh] ${path.relative(repoRoot, file)} не існує — запусти \`pnpm api:generate-openapi\``,
  );
  process.exit(1);
}

if (actual !== expected) {
  console.error(
    `[openapi-fresh] ${path.relative(repoRoot, file)} відстає від zod-схем.\n` +
      `  Запусти \`pnpm api:generate-openapi\` і закоміть результат.`,
  );
  process.exit(1);
}

console.log(
  `[openapi-fresh] ${path.relative(repoRoot, file)} актуальна (≡ generator output).`,
);
