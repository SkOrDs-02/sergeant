// scripts/__tests__/ci-bundle-budget-gates.test.mjs
//
// Shape-regression tests for the bundle-budget gates in
// `.github/workflows/ci.yml` (job `bundle-budgets`).
//
// Ці гейти вже двічі мовчали, і обидва рази з однієї причини: вони стояли
// КРОКАМИ всередині джоби `check`, після «Format, lint, test, build». Коли
// той крок падав, GitHub Actions пропускав усі наступні, і бюджет просто не
// мірявся — у логах це виглядає не як «перевищено», а як тиша (AGENTS.md
// § Performance budgets, ратчети 2026-08-18 і 2026-09-11). Гірше того,
// `size-limit` ховав ще й eager-гейт, який стояв кроком нижче: критичний
// шлях не міряли жодного разу за весь час мовчання.
//
// Тому тут перевіряється не «гейт існує», а саме та властивість, втрата
// якої й робила його мовчазним:
//
//   1. happy path — обидва гейти живуть у ВЛАСНІЙ джобі, не в `check`.
//   2. edge case — eager не залежить від зеленого `size-limit`, тобто має
//      `always()`; і жоден із гейтів не fail-open.
//
// Парсер навмисно рядковий і без залежностей — той самий компроміс, що і в
// ci-dedupe-gate.test.mjs поруч.
//
// Run with:  node --test scripts/__tests__/ci-bundle-budget-gates.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "ci.yml",
);

/** @see ci-dedupe-gate.test.mjs — той самий 2-space канон від prettier. */
function extractJobBlock(workflow, jobName) {
  const lines = workflow.split("\n");
  const headerRe = new RegExp(`^  ${jobName}:\\s*$`);
  const start = lines.findIndex((l) => headerRe.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[a-zA-Z_][a-zA-Z0-9_-]*:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * Ріже блок джоби на окремі кроки. Крок починається з `- name:` або
 * `- uses:` на 6-space відступі всередині `steps:`; решта рядків до
 * наступного такого маркера належить поточному кроку. Повертає масив сирих
 * текстів — саме текст, а не розпарсений обʼєкт, бо перевірки нижче питають
 * про наявність `if:`/`continue-on-error:` у кроці, і рядок відповідає на це
 * прямо.
 */
function extractSteps(jobBlock) {
  const steps = [];
  let current = null;
  for (const line of jobBlock.split("\n")) {
    if (/^ {6}- (name|uses):/.test(line)) {
      if (current !== null) steps.push(current);
      current = line;
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  if (current !== null) steps.push(current);
  return steps;
}

const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf-8");
const BUDGET_JOB = extractJobBlock(WORKFLOW, "bundle-budgets");
const CHECK_JOB = extractJobBlock(WORKFLOW, "check");

const SIZE_LIMIT_RE =
  /run:\s*pnpm --filter @sergeant\/web exec size-limit\s*$/m;
const EAGER_RE = /run:\s*node scripts\/ci\/check-eager-bundle\.mjs\s*$/m;

test("happy path: обидва бандл-гейти живуть у власній джобі", () => {
  assert.ok(
    BUDGET_JOB,
    "очікується джоба `bundle-budgets:` під `jobs:` у .github/workflows/ci.yml",
  );

  const steps = extractSteps(BUDGET_JOB);
  assert.equal(
    steps.filter((s) => SIZE_LIMIT_RE.test(s)).length,
    1,
    "очікується рівно один крок `size-limit` у джобі `bundle-budgets`",
  );
  assert.equal(
    steps.filter((s) => EAGER_RE.test(s)).length,
    1,
    "очікується рівно один крок `check-eager-bundle.mjs` у джобі `bundle-budgets`",
  );

  // Гейт міряє те, що зібрано ЦІЄЮ джобою: без власного білда
  // `apps/server/dist/assets/` тут просто порожній.
  const buildIdx = steps.findIndex((s) =>
    /run:\s*pnpm --filter @sergeant\/web build\s*$/m.test(s),
  );
  const sizeIdx = steps.findIndex((s) => SIZE_LIMIT_RE.test(s));
  assert.ok(
    buildIdx !== -1,
    "джоба `bundle-budgets` мусить сама збирати web — вона не має доступу до артефактів `check`",
  );
  assert.ok(
    sizeIdx > buildIdx,
    "`size-limit` мусить іти ПІСЛЯ білда — інакше він міряє порожню теку",
  );
});

test("регрес, від якого цей тест і стоїть: гейти не повертаються в `check`", () => {
  assert.ok(CHECK_JOB, "очікується джоба `check:` під `jobs:`");

  assert.doesNotMatch(
    CHECK_JOB,
    SIZE_LIMIT_RE,
    "`size-limit` не має жити в `check`: там він стоїть після «Format, lint, test, " +
      "build» і мовчки не виконується, щойно той крок червоніє (AGENTS.md § Performance budgets)",
  );
  assert.doesNotMatch(
    CHECK_JOB,
    EAGER_RE,
    "eager-гейт не має жити в `check` — та сама причина",
  );
});

/**
 * Значення ключа `if:` кроку, зі знятим `>-` та склеєними продовженнями.
 * Повертає `null`, якщо ключа немає. Потрібне тому, що перевірки нижче
 * питають про ВИРАЗ, а не про наявність підрядка: `always() && false` містить
 * `always()`, але вимикає крок назавжди.
 */
function ifExpression(step) {
  const lines = step.split("\n");
  const start = lines.findIndex((l) => /^\s*if:/.test(l));
  if (start === -1) return null;
  const startLine = lines[start];
  const indent = startLine.match(/^(\s*)/)[1].length;
  let value = startLine.replace(/^\s*if:\s*/, "").replace(/^[>|][-+]?\s*$/, "");
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const lineIndent = line.match(/^(\s*)/)[1].length;
    // Продовження блокового скаляра — глибший відступ і не новий YAML-ключ.
    if (lineIndent <= indent || /^\s*[a-zA-Z_-]+:/.test(line)) break;
    value += " " + line.trim();
  }
  return value.trim();
}

test("edge case: eager не залежить від зеленого size-limit", () => {
  assert.ok(BUDGET_JOB, "очікується джоба `bundle-budgets:` (див. вище)");

  const eagerStep = extractSteps(BUDGET_JOB).find((s) => EAGER_RE.test(s));
  assert.ok(eagerStep, "очікується крок eager-гейта (див. вище)");

  const expr = ifExpression(eagerStep);
  assert.ok(expr, "eager мусить мати ключ `if:`");
  assert.match(
    expr,
    /\balways\(\)/,
    "eager мусить мати `always()`: без нього червоний `size-limit` робить його " +
      "`skipped`, і критичний шлях лишається неміряним саме тоді, коли це найважливіше",
  );
  // `always() && false` містить `always()` і при цьому вимикає крок назавжди —
  // перевіряти наявність підрядка тут недостатньо.
  assert.doesNotMatch(
    expr,
    /\bfalse\b/,
    "у виразі `if:` eager-гейта не може бути літерального `false`: " +
      "`always() && false` проходить перевірку на `always()`, але крок не виконається ніколи",
  );
});

test("edge case: жоден із гейтів не fail-open", () => {
  assert.ok(BUDGET_JOB, "очікується джоба `bundle-budgets:` (див. вище)");

  const steps = extractSteps(BUDGET_JOB);
  for (const [label, re] of [
    ["size-limit", SIZE_LIMIT_RE],
    ["eager", EAGER_RE],
  ]) {
    const step = steps.find((s) => re.test(s));
    assert.ok(step, `очікується крок ${label}`);

    // Не «немає `continue-on-error: true`», а «якщо ключ є — його значення
    // рівно `false`». Інакше повз проходить виразна форма
    // `continue-on-error: ${{ true }}`, яку GitHub розуміє так само.
    const coe = step.match(/continue-on-error:\s*(.+)$/m);
    if (coe) {
      assert.equal(
        coe[1].trim(),
        "false",
        `${label}: \`continue-on-error\` допускається лише зі значенням \`false\` — ` +
          `будь-яке інше (зокрема виразне \`\${{ true }}\`) і є «червоний завжди = вимкнений»`,
      );
    }

    assert.doesNotMatch(
      step,
      /\|\|\s*(true|exit\s+0|:)\s*$/m,
      `${label} не може мати \`|| true\` / \`|| exit 0\` втечу`,
    );

    const expr = ifExpression(step);
    if (expr !== null) {
      assert.doesNotMatch(
        expr,
        /^\s*false\s*$/,
        `${label} не може бути вимкнений через \`if: false\``,
      );
    }
  }
});
