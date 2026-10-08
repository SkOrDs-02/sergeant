// Перезапис `src/lib/contentHashes.json` після зміни тексту сторінок.
// Окремий скрипт, а не `UPDATE_CONTENT_HASHES=1 vitest …` у package.json:
// така форма змінної не працює в PowerShell. Гейт і пояснення – у
// `src/lib/contentFreshness.test.ts`.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const res = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "src/lib/contentFreshness.test.ts"],
  {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, UPDATE_CONTENT_HASHES: "1" },
  },
);
process.exit(res.status ?? 1);
