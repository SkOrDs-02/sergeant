// Юніти для `scripts/pre-commit-derived-artifacts.mjs` — pre-commit гейта
// похідних артефактів. Перевіряють три речі, кожна з яких уже ламалась або
// може зламатись тихо:
//   1. `resolveCommand` бере команду з package.json, а не з власної копії
//      шляху (саме дублювання шляху й дає розсинхрон, який гейт ловить).
//   2. lint-staged-конфіг справді містить обидва записи, і docs-перевірка
//      стоїть ПІСЛЯ bump-а — інакше вона міряє доbump-ний вміст.
//   3. Повідомлення про збій називає точну команду фіксу.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  formatFailure,
  parseGroups,
  resolveCommand,
} from "../pre-commit-derived-artifacts.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
);

test("parseGroups бере лише названі групи й ігнорує імена файлів", () => {
  assert.deepEqual(parseGroups(["--docs", "docs/today.md", "AGENTS.md"]), [
    "docs",
  ]);
  assert.deepEqual(parseGroups(["--openapi"]), ["openapi"]);
  assert.deepEqual(parseGroups(["--docs", "--openapi"]), ["docs", "openapi"]);
  assert.deepEqual(parseGroups(["docs/today.md"]), []);
  assert.deepEqual(parseGroups(["--nope"]), []);
});

test("resolveCommand розгортає прямий node-скрипт повз обгортку pnpm", () => {
  const { cmd, args } = resolveCommand("docs:check-today", {
    "docs:check-today": "node scripts/docs/generate-today.mjs --check",
  });
  assert.equal(cmd, process.execPath);
  assert.deepEqual(args, ["scripts/docs/generate-today.mjs", "--check"]);
});

test("resolveCommand віддає індирекцію самому pnpm", () => {
  const { cmd, args } = resolveCommand("docs:check-x", {
    "docs:check-x": "pnpm lint:something",
  });
  assert.equal(cmd, "pnpm");
  assert.deepEqual(args, ["-s", "docs:check-x"]);
});

test("resolveCommand падає на неіснуючому скрипті, а не тихо пропускає", () => {
  assert.throws(() => resolveCommand("docs:check-ghost", {}), /немає скрипта/);
});

// Головний антидрейф-тест. Скрипт свідомо НЕ тримає власних шляхів до
// генераторів — але тримає ІМЕНА pnpm-скриптів. Перейменування скрипта в
// package.json без правки таблиці дало б `throw` посеред коміту, тож
// перевіряємо тут, дешево.
test("кожен check/fix із таблиці існує в package.json", async () => {
  const src = readFileSync(
    resolve(REPO_ROOT, "scripts/pre-commit-derived-artifacts.mjs"),
    "utf8",
  );
  const referenced = [...src.matchAll(/^\s+(?:check|fix): "([^"]+)",$/gm)].map(
    (m) => m[1],
  );

  assert.ok(referenced.length >= 12, "таблиця груп не розпарсилась");
  for (const name of referenced) {
    assert.ok(
      typeof pkg.scripts?.[name] === "string",
      `package.json не має скрипта "${name}"`,
    );
  }
});

test("lint-staged викликає гейт для обох груп", () => {
  const staged = pkg["lint-staged"];
  const md = staged["*.md"];
  assert.ok(
    md.some((c) => c.includes("pre-commit-derived-artifacts.mjs --docs")),
    "*.md не викликає --docs",
  );

  const openapiKey = Object.keys(staged).find((k) =>
    k.includes("packages/shared/src"),
  );
  assert.ok(openapiKey, "немає path-scoped запису для packages/shared");
  assert.ok(
    staged[openapiKey].some((c) =>
      c.includes("pre-commit-derived-artifacts.mjs --openapi"),
    ),
    "shared-запис не викликає --openapi",
  );
});

// Порядок усередині запису — не косметика. `bump-last-validated.mjs`
// переписує дати у staged .md, і саме після нього похідні доки можуть
// розійтись. Перевірка, що стоїть ДО bump-а, міряє вміст, якого в коміті
// вже не буде.
test("docs-перевірка стоїть після bump-last-validated", () => {
  const md = pkg["lint-staged"]["*.md"];
  const bump = md.findIndex((c) => c.includes("bump-last-validated.mjs"));
  const check = md.findIndex((c) =>
    c.includes("pre-commit-derived-artifacts.mjs"),
  );
  assert.ok(bump >= 0 && check >= 0);
  assert.ok(check > bump, "гейт мусить бачити вміст ПІСЛЯ bump-а");
});

test("formatFailure називає артефакт, команду регенерації та git add", () => {
  const out = formatFailure([
    {
      artifact: "docs/today.md",
      check: "docs:check-today",
      fix: "docs:gen-today",
    },
    {
      artifact: "docs/README.md (блок trust-badge)",
      check: "docs:check-trust-badge",
      fix: "docs:gen-trust-badge",
    },
  ]);
  assert.match(out, /docs\/today\.md/);
  assert.match(out, /pnpm docs:gen-today && pnpm docs:gen-trust-badge/);
  // Дужковий коментар до шляху не має протікати в `git add`.
  assert.match(out, /git add docs\/today\.md docs\/README\.md$/m);
  assert.match(out, /SERGEANT_NO_DERIVED_CHECK=1/);
});
