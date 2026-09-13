// scripts/__tests__/ci-mobile-gate.test.mjs
//
// Гейт для PR-M1 (`docs/work/specs/audits/2026-09-13-product-full-review.md`).
//
// Чому це парсерний тест, а не «просто прибрали фільтр». `apps/mobile` жив
// поза CI не через технічну перешкоду, а через тимчасову поставу «web-focus
// phase», записану коментарем. Такі постави переживають свою причину: фільтр
// `--filter=!@sergeant/mobile` пролежав у `check:typecheck-and-test:ci` доти,
// доки цілу поверхню продукту перестали перевіряти взагалі — і коштувало це
// вже двічі. 2026-08-07 `main` був червоний через три mobile-тести, яких
// ніхто не бачив; 2026-09-13 повний греп `habitScheduledOnDate` знайшов у
// `apps/mobile` живий баг того самого класу, що правили на вебі, і жоден
// гейт не міг би його побачити, бо на мобайлі не бігав навіть `tsc`.
//
// Прибрати фільтр — одна правка; НЕ дати йому повернутись мовчки — оце й
// робить цей файл. Той самий підхід, що в `ci-bundle-budget-gates.test.mjs`:
// тест читає сам артефакт (`package.json`, `.github/workflows/ci.yml`), а не
// опис того, що в ньому має бути.
//
// Чого гейт НЕ вимагає: покриття (`test:coverage:ci`) досі пропускає мобайл
// свідомо — йому потрібне власне baseline-число в `coverage-thresholds.json`
// і рядок у `coverage-ratchet.mjs`. Тест це фіксує явним твердженням, щоб
// різниця між «свідомо відкладено» і «тихо загубилось» лишалась видимою.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const MOBILE_FILTER = "--filter=!@sergeant/mobile";

function readRootScripts() {
  const pkg = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
  );
  return pkg.scripts ?? {};
}

function mustHaveScript(scripts, name) {
  const value = scripts[name];
  assert.ok(
    typeof value === "string",
    `ci-mobile-gate: кореневий скрипт "${name}" зник — онови цей тест разом із перейменуванням`,
  );
  return value;
}

test("check:typecheck-and-test:ci не виключає @sergeant/mobile", () => {
  const scripts = readRootScripts();
  const script = mustHaveScript(scripts, "check:typecheck-and-test:ci");
  assert.ok(
    !script.includes(MOBILE_FILTER),
    `ci-mobile-gate: у "check:typecheck-and-test:ci" повернувся ${MOBILE_FILTER}.\n` +
      `Це прибирає apps/mobile з typecheck і jest у джобі \`check\` — тобто ціла\n` +
      `поверхня продукту знову лишається без жодної механічної перевірки.\n` +
      `Якщо мобайл справді треба тимчасово вимкнути — зроби це видимо: окремий\n` +
      `скрипт із власною назвою і причиною, а не фільтр усередині спільного.`,
  );
});

test("check:ci проходить саме через check:typecheck-and-test:ci", () => {
  const scripts = readRootScripts();
  const checkCi = mustHaveScript(scripts, "check:ci");
  assert.ok(
    checkCi.includes("check:typecheck-and-test:ci"),
    `ci-mobile-gate: "check:ci" більше не викликає "check:typecheck-and-test:ci".\n` +
      `Перший тест цього файлу стереже не той ланцюжок — онови обидва разом.`,
  );
});

test("джоба check у ci.yml запускає саме pnpm check:ci", () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, ".github/workflows/ci.yml"),
    "utf8",
  );
  assert.ok(
    workflow.includes("pnpm check:ci"),
    `ci-mobile-gate: у .github/workflows/ci.yml немає виклику \`pnpm check:ci\`.\n` +
      `Скрипти можуть бути скільки завгодно правильними — якщо воркфлоу їх не\n` +
      `кличе, гейта немає. Онови цей тест разом зі зміною форми джоби.`,
  );
});

test("test:coverage:ci досі пропускає mobile — свідомо, і це задокументовано", () => {
  const scripts = readRootScripts();
  const coverage = mustHaveScript(scripts, "test:coverage:ci");
  // Не «має пропускати», а «якщо пропускає — причина мусить бути в коментарі
  // воркфлоу». Коли мобайл заведуть у покриття, цей тест впаде і змусить
  // прибрати застарілий коментар замість лишити його брехати.
  const workflow = readFileSync(
    resolve(REPO_ROOT, ".github/workflows/ci.yml"),
    "utf8",
  );
  if (coverage.includes(MOBILE_FILTER)) {
    assert.ok(
      workflow.includes("coverage-thresholds.json"),
      `ci-mobile-gate: покриття пропускає mobile, але у воркфлоу немає пояснення,\n` +
        `що для цього бракує baseline-числа. Мовчазний пропуск через рік читається\n` +
        `як «так і задумано».`,
    );
  } else {
    assert.ok(
      !workflow.includes(
        "`test:coverage:ci` досі пропускає @sergeant/mobile — свідомо",
      ),
      `ci-mobile-gate: mobile завели в покриття, але коментар у ci.yml усе ще\n` +
        `каже, що його пропущено. Прибери застарілий коментар.`,
    );
  }
});
