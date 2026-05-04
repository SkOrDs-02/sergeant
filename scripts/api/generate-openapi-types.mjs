#!/usr/bin/env node
/**
 * Generates TypeScript types for `packages/api-client` directly from the
 * committed OpenAPI spec (`docs/api/openapi.json`).
 *
 * Запуск: `pnpm api:generate-openapi-types` або
 *         `node scripts/api/generate-openapi-types.mjs`.
 *
 * Output: `packages/api-client/src/generated/openapi.d.ts` — auto-generated;
 *         не редагуй вручну. Закоміть результат у тому ж PR, що міняє spec
 *         (zod → openapi.json → openapi.d.ts).
 *
 * Drift gate: `scripts/api/check-openapi-types-fresh.mjs` (виконується через
 * `pnpm api:check-openapi-types` у `pnpm lint`).
 *
 * Mirror to: `scripts/api/generate-openapi.mjs` (zod → openapi.json). Обидва
 * скрипти разом утворюють Phase 1+2+3 з ADR-0025: zod single source of truth →
 * OpenAPI doc → TS types для клієнтів.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const specPath = path.join(repoRoot, "docs", "api", "openapi.json");
const outPath = path.join(
  repoRoot,
  "packages",
  "api-client",
  "src",
  "generated",
  "openapi.d.ts",
);

const result = spawnSync(
  "pnpm",
  ["exec", "openapi-typescript", specPath, "-o", outPath],
  { cwd: repoRoot, stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
