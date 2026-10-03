#!/usr/bin/env node
/**
 * Гейт: кожен тест-файл у `apps/**` і `packages/**` має свій runner.
 *
 * @status Active
 *
 * Клас проблеми: `apps/server/vitest.config.ts` включав лише `src/**` і
 * тихо не бачив `apps/server/scripts/token-reencrypt-rollover.test.ts`, тож
 * тест ротації ключа шифрування токенів існував, але не запускався ні в
 * `pnpm test`, ні в CI. Файл, який ніхто не виконує, дає ілюзію покриття, а
 * протухає непомітно.
 *
 * Що перевіряється: кожен tracked `*.test.*` / `*.spec.*` у `apps/**` і
 * `packages/**` мусить збігатися з `include` одного з `vitest*.config.*` свого
 * воркспейсу, або з `testRegex` jest-конфігу (mobile), або з явним патерном
 * інших runner-ів нижче (`node --test`, Playwright). Береться лише `include`,
 * у якому згадано `.test.` чи `.spec.` (тобто не `coverage.include`).
 *
 * Додаєш новий runner чи каталог тестів — допиши його в `OTHER_RUNNERS` з
 * поясненням, хто це запускає.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Тести, що їх запускає не vitest/jest воркспейсу. Шляхи від кореня репо. */
export const OTHER_RUNNERS = [
  // `node --test` у lint-ланцюжку кореня (`pnpm lint`) і `pnpm lint:plugins`.
  "packages/eslint-plugin-sergeant-design/__tests__/*.test.mjs",
  // `pnpm --filter @sergeant/mobile-shell test:scripts` (`node --test`).
  "apps/mobile-shell/scripts/__tests__/*.test.mjs",
  // Playwright-спеки: власні `playwright.*.config.ts` і CI-джоби e2e/a11y.
  "apps/web/tests/**",
  "apps/landing/tests/**",
];

const escapeRe = (s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&");

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      const alts = glob.slice(i + 1, end).split(",");
      re += `(?:${alts.map(escapeRe).join("|")})`;
      i = end;
    } else if (c === "?") re += "[^/]";
    else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`);
}

/** `include: [...]`-масиви vitest-конфігу, що стосуються тестів, а не coverage. */
export function extractVitestIncludes(source) {
  const out = [];
  for (const m of source.matchAll(/\binclude:\s*\[([^\]]*)\]/g)) {
    const items = [...m[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((x) => x[1]);
    if (items.some((p) => /\.(test|spec)\b/.test(p))) out.push(...items);
  }
  return out;
}

function trackedTestFiles() {
  const out = execFileSync("git", ["ls-files", "apps", "packages"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\n").filter((f) => TEST_FILE_RE.test(f));
}

/** Воркспейс = перші два сегменти шляху (`apps/server`, `packages/shared`). */
function workspaceOf(file) {
  return file.split("/").slice(0, 2).join("/");
}

export function findOrphans(files, repoRoot = REPO_ROOT) {
  const otherRunners = OTHER_RUNNERS.map(globToRegExp);
  const cache = new Map();
  const runnersFor = (ws) => {
    if (cache.has(ws)) return cache.get(ws);
    const dir = join(repoRoot, ws);
    const vitest = [];
    const jest = [];
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (/^vitest(\..+)?\.config\.[cm]?[jt]s$/.test(name)) {
          const src = readFileSync(join(dir, name), "utf8");
          for (const g of extractVitestIncludes(src))
            vitest.push(globToRegExp(g));
        }
        if (/^jest\.config\.[cm]?js$/.test(name)) {
          const cfg = createRequire(import.meta.url)(join(dir, name));
          for (const r of [].concat(cfg.testRegex ?? []))
            jest.push(new RegExp(r));
        }
      }
    }
    // Воркспейс без жодного конфігу, але з `vitest` у скрипті `test`, живе на
    // дефолтному include vitest-а (`**/*.{test,spec}.*`), напр. tabular-import.
    if (
      vitest.length === 0 &&
      jest.length === 0 &&
      existsSync(join(dir, "package.json"))
    ) {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (/\bvitest\b/.test(pkg.scripts?.test ?? "")) {
        const hasCfg = readdirSync(dir).some((n) =>
          /^vitest(\..+)?\.config\./.test(n),
        );
        if (!hasCfg)
          vitest.push(
            globToRegExp("**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"),
          );
      }
    }
    const res = { vitest, jest };
    cache.set(ws, res);
    return res;
  };
  return files.filter((file) => {
    if (otherRunners.some((re) => re.test(file))) return false;
    const ws = workspaceOf(file);
    const rel = file.slice(ws.length + 1);
    const { vitest, jest } = runnersFor(ws);
    return !(
      vitest.some((re) => re.test(rel)) || jest.some((re) => re.test(file))
    );
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const files = trackedTestFiles();
  const orphans = findOrphans(files);
  if (orphans.length > 0) {
    console.error(
      `check-test-orphans: ${orphans.length} тест-файл(ів) не потрапляє в жоден runner:\n` +
        orphans.map((f) => `  - ${f}`).join("\n") +
        "\nРозшир include у vitest-конфігу воркспейсу або додай runner в OTHER_RUNNERS (scripts/check-test-orphans.mjs).",
    );
    process.exit(1);
  }
  console.log(
    `check-test-orphans: OK (${files.length} тест-файлів, осиротілих немає)`,
  );
}
