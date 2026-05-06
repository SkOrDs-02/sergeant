#!/usr/bin/env node
/**
 * Verifies that `packages/api-client/src/generated/openapi.d.ts` matches what
 * `openapi-typescript` produces from the current `docs/api/openapi.json`.
 *
 * Запуск: `pnpm api:check-openapi-types` (root) або
 *         `node scripts/api/check-openapi-types-fresh.mjs`.
 *
 * Поведінка: regenerates types у tmpfile, читає коммітнутий файл, побайтно
 *           порівнює. Несинхронізовано → process.exit(1) з підказкою, що
 *           запустити (`pnpm api:generate-openapi-types`).
 *
 * Виконується у `pnpm lint` (root `package.json`) разом із зчіпленим
 * `pnpm api:check-openapi`. Так zod → openapi.json → openapi.d.ts тримаються
 * у синхроні в одному PR, а не окремо.
 *
 * Mirror: `scripts/api/check-openapi-fresh.mjs` (zod → openapi.json gate).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

const tmp = mkdtempSync(path.join(tmpdir(), "sergeant-openapi-types-"));
const tmpOut = path.join(tmp, "openapi.d.ts");
const openApiTypescriptBin = path.join(
  repoRoot,
  "node_modules",
  "openapi-typescript",
  "bin",
  "cli.js",
);

try {
  const gen = spawnSync(
    process.execPath,
    [openApiTypescriptBin, specPath, "-o", tmpOut],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (gen.status !== 0) {
    process.stderr.write(gen.stderr?.toString() ?? "");
    console.error(
      "[openapi-types-fresh] generator failed; cannot compare against committed file",
    );
    process.exit(gen.status ?? 1);
  }

  const expected = readFileSync(tmpOut, "utf8");
  let actual = "";
  try {
    actual = readFileSync(outPath, "utf8");
  } catch {
    console.error(
      `[openapi-types-fresh] ${path.relative(repoRoot, outPath)} не існує — запусти \`pnpm api:generate-openapi-types\``,
    );
    process.exit(1);
  }

  if (expected !== actual) {
    console.error(
      `[openapi-types-fresh] ${path.relative(repoRoot, outPath)} відстає від ${path.relative(repoRoot, specPath)}.\n` +
        `Запусти \`pnpm api:generate-openapi-types\` і закоміть файл.`,
    );
    process.exit(1);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
