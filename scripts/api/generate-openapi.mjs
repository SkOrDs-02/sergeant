#!/usr/bin/env node
/**
 * Generates `docs/api/openapi.json` from zod-схем у `@sergeant/shared`.
 *
 * Запуск:    `pnpm api:generate-openapi` (root) або
 *            `node scripts/api/generate-openapi.mjs`.
 *
 * CI gate:   `.github/workflows/openapi-freshness.yml` запускає цей скрипт
 *            і `git diff --exit-code` — якщо результат відрізняється від
 *            коммітнутого файлу, PR не пройде. Це дзеркало рішення з ADR-0025.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { register } from "tsx/esm/api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// tsx ESM-loader для інлайн-завантаження TS-модулів без build-step.
register();

const { buildOpenApiDocument } = await import(
  path.join(repoRoot, "packages/shared/src/openapi/index.ts")
);

const document = buildOpenApiDocument();

const outDir = path.join(repoRoot, "docs", "api");
mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, "openapi.json");
writeFileSync(outFile, JSON.stringify(document, null, 2) + "\n", "utf8");

const pathCount = Object.keys(document.paths ?? {}).length;
const componentCount = Object.keys(document.components?.schemas ?? {}).length;
console.log(
  `Wrote ${path.relative(repoRoot, outFile)} (${pathCount} paths, ${componentCount} components)`,
);
