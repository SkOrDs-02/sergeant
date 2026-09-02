#!/usr/bin/env node
// scripts/docs/check-workspace-readme-scripts.mjs
//
// Гейт «README воркспейсу знає всі свої скрипти». Для кожного `apps/*` і
// `packages/*` з непорожнім `scripts` у package.json перевіряє, що README.md
// існує і згадує КОЖНЕ імʼя скрипта як окремий токен (`test:watch`, `e2e:mobile`).
//
// Навіщо: 2026-09-02 аудит знайшов, що README apps/web і apps/server не
// описують по 15 скриптів кожен, а два пакети README не мали взагалі. Скрипт
// без згадки в README — невидимий для людини й агента, які читають README,
// а не package.json.
//
// Usage:
//   node scripts/docs/check-workspace-readme-scripts.mjs          # CI-гейт (exit 1 на прогалинах)
//   node scripts/docs/check-workspace-readme-scripts.mjs --json   # машинний вивід
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKSPACE_PARENTS = ["apps", "packages"];

/** Чи згадує README імʼя скрипта як цілий токен (не як префікс іншого). */
export function readmeMentionsScript(readme, script) {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w:-])${escaped}(?![\\w:-])`, "m").test(readme);
}

/** Повертає список прогалин `{ workspace, missing: string[] }` для кореня. */
export function findGaps(rootDir = REPO_ROOT) {
  const gaps = [];
  for (const parent of WORKSPACE_PARENTS) {
    const parentDir = join(rootDir, parent);
    if (!existsSync(parentDir)) continue;
    for (const name of readdirSync(parentDir).sort()) {
      const dir = join(parentDir, name);
      const pkgPath = join(dir, "package.json");
      if (!existsSync(pkgPath)) continue;
      const scripts = Object.keys(
        JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {},
      );
      if (scripts.length === 0) continue;
      const readmePath = join(dir, "README.md");
      if (!existsSync(readmePath)) {
        gaps.push({
          workspace: `${parent}/${name}`,
          missing: scripts,
          noReadme: true,
        });
        continue;
      }
      const readme = readFileSync(readmePath, "utf8");
      const missing = scripts.filter((s) => !readmeMentionsScript(readme, s));
      if (missing.length > 0)
        gaps.push({ workspace: `${parent}/${name}`, missing });
    }
  }
  return gaps;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const gaps = findGaps();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(gaps, null, 2));
  } else if (gaps.length === 0) {
    console.log(
      "✅ [readme-scripts] every workspace README mentions all of its scripts.",
    );
  } else {
    console.error("❌ [readme-scripts] README не описує скрипти package.json:");
    for (const g of gaps) {
      console.error(
        `  ${g.workspace}/README.md${g.noReadme ? " (відсутній)" : ""}: ${g.missing.join(", ")}`,
      );
    }
    console.error("\nДодай згадку у розділ «## Команди» README воркспейсу.");
  }
  process.exit(gaps.length === 0 ? 0 : 1);
}
