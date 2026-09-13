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

// Унікальний токен саме того коментаря в `ci.yml`, який пояснює, ЧОМУ мобайл
// поза покриттям. Раніше тут стояв `coverage-thresholds.json` — рядок, що
// зустрічається у воркфлоу й без жодного пояснення, тож видалення пояснення
// лишало тест зеленим (знахідка рев'ю CodeRabbit на PR #1134). Токен існує
// рівно для того, щоб цього не сталось: він ніде більше не потрібен.
const MOBILE_COVERAGE_MARKER = "MOBILE_COVERAGE_BASELINE_MISSING";

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
  // Перевіряємо ВІДСУТНІСТЬ будь-якого `--filter`, а не однієї конкретної
  // форми виключення. Перша версія тесту ловила рівно `--filter=!@sergeant/
  // mobile` — і пропускала `--filter=@sergeant/web`, який виключає мобайл так
  // само надійно, просто з іншого боку (знахідка рев'ю CodeRabbit на PR
  // #1134). Скрипт називається `check:typecheck-and-test:ci` і має означати
  // «весь монорепо»: фільтр тут у принципі не потрібен, тож заборона на всі
  // фільтри — не надмірність, а точний опис інваріанта.
  assert.ok(
    !script.includes("--filter"),
    `ci-mobile-gate: у "check:typecheck-and-test:ci" зʼявився \`--filter\`.\n` +
      `Будь-який фільтр тут звужує джобу \`check\` до частини воркспейсів —\n` +
      `неважливо, виключенням (\`${MOBILE_FILTER}\`) чи вибором одного\n` +
      `(\`--filter=@sergeant/web\`). Наслідок однаковий: ціла поверхня продукту\n` +
      `лишається без жодної механічної перевірки.\n` +
      `Якщо якийсь воркспейс справді треба тимчасово вимкнути — зроби це видимо:\n` +
      `окремий скрипт із власною назвою і причиною, а не фільтр усередині спільного.`,
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
      workflow.includes(MOBILE_COVERAGE_MARKER),
      `ci-mobile-gate: покриття пропускає mobile, але у воркфлоу немає токена\n` +
        `${MOBILE_COVERAGE_MARKER}, тобто немає пояснення, що для цього бракує\n` +
        `baseline-числа у coverage-thresholds.json. Мовчазний пропуск через рік\n` +
        `читається як «так і задумано».`,
    );
  } else {
    assert.ok(
      !workflow.includes(MOBILE_COVERAGE_MARKER),
      `ci-mobile-gate: mobile завели в покриття, але коментар у ci.yml усе ще\n` +
        `несе ${MOBILE_COVERAGE_MARKER} — тобто каже, що його пропущено.\n` +
        `Прибери застарілий коментар разом із токеном.`,
    );
  }
});
