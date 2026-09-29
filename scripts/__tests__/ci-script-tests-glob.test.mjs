// scripts/__tests__/ci-script-tests-glob.test.mjs
//
// Shape-regression test для кроку «Script unit tests (whole glob…)» у
// `.github/workflows/ci.yml` (джоба `check`).
//
// Клас проблеми той самий, що в `ci-bundle-budget-gates` і
// `ci-todo-freshness-gate` поруч, але тут вона тонша. Ті гейти мовчали,
// бо стояли ПІСЛЯ червоного кроку. Цей мовчав, бо його ПЕРЕЛІК не встигав
// за деревом: CI викликав тести `scripts/**` адресно, файл за файлом, тож
// тест, якого немає в жодному переліку, не виконував ніхто.
//
// Аудит осиротілого коду назвав це ще 2026-08-05: «~30 тест-файлів у
// `scripts/**` і `tools/**` не запускає жоден runner… це написані й
// покинуті тести, що створюють ілюзію покриття». Перший прогін усього
// глоба (аудит шуму, 2026-09-17) дав пʼять падінь на чистому `main`, і
// жодне не було свіжим — усі відстали від коду на тижні або місяці.
//
// Тому перевіряється не «крок існує», а саме та властивість, втрата якої
// повертає діру:
//
//   1. happy path — крок викликає ГЛОБ, а не перелік файлів;
//   2. регрес — глоб у лапках (без них шелл розкриє його сам, і новий
//      файл, доданий після останнього `git add`, тихо випаде з набору);
//   3. edge case — крок не fail-open (`continue-on-error`, `|| true`).
//
// Парсер навмисно рядковий і без залежностей — той самий компроміс, що й
// у двох сусідніх shape-тестах.
//
// Run with:  node --test scripts/__tests__/ci-script-tests-glob.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const WORKFLOW_PATH = resolve(REPO_ROOT, ".github", "workflows", "ci.yml");

function workflow() {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

/** Рядок `run:` кроку з цією назвою (разом із можливим блоковим тілом). */
function runLineForStep(src, stepName) {
  const lines = src.split("\n");
  const i = lines.findIndex((l) => l.includes(`- name: ${stepName}`));
  if (i < 0) return null;
  // Крок закінчується наступним `- name:` того ж рівня.
  const rest = lines.slice(i + 1);
  const end = rest.findIndex((l) => /^\s{6}- name:/.test(l));
  const body = (end < 0 ? rest : rest.slice(0, end)).join("\n");
  const m = body.match(/^\s*run:\s*(.*)$/m);
  return m ? { body, run: m[1] } : null;
}

const STEP = "Script unit tests (whole glob, not a hand-kept list)";

test("крок існує і викликає саме ГЛОБ, а не перелік файлів", () => {
  const step = runLineForStep(workflow(), STEP);
  assert.ok(step, `крок «${STEP}» зник із ci.yml`);
  assert.match(step.run, /node --test/);
  assert.match(
    step.run,
    /scripts\/__tests__\/\*\.test\.mjs/,
    "перелік замість глоба — рівно та форма, через яку тести гнили мовчки",
  );
});

test("глоб у лапках — інакше його розкриє шелл, а не Node", () => {
  // Без лапок bash підставить лише ті файли, що існують на момент
  // розкриття, і поведінка почне залежати від шелла раннера. Node вміє
  // розкривати глоб сам — саме це нам і треба.
  const step = runLineForStep(workflow(), STEP);
  assert.ok(step);
  assert.match(step.run, /"scripts\/__tests__\/\*\.test\.mjs"/);
});

test("крок не fail-open", () => {
  const step = runLineForStep(workflow(), STEP);
  assert.ok(step);
  assert.doesNotMatch(step.body, /continue-on-error:\s*true/);
  assert.doesNotMatch(step.body, /\|\|\s*true/);
});

test("кожен тест-файл теки покривається цим глобом", () => {
  // Змістовна частина: глоб мусить накривати РЕАЛЬНИЙ вміст теки. Якщо
  // колись зʼявиться файл з іншим суфіксом (`*.spec.mjs`, `*.test.ts`),
  // він знову випаде з набору — і цей тест назве його першим.
  const files = readdirSync(__dirname).filter((f) => /\.(test|spec)\./.test(f));
  assert.ok(files.length > 0, "тека тестів порожня — глоб нема що ловити");
  const missed = files.filter((f) => !/\.test\.mjs$/.test(f));
  assert.deepEqual(
    missed,
    [],
    `ці файли не підпадають під глоб \`*.test.mjs\`: ${missed.join(", ")}`,
  );
});
