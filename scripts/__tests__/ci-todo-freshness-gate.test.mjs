// scripts/__tests__/ci-todo-freshness-gate.test.mjs
//
// Shape-regression test for the TODO-freshness gate in
// `.github/workflows/ci.yml` (job `todo-freshness`).
//
// Третій випадок того самого класу після `bundle-budgets` і `security-audit`:
// гейт стояв КРОКОМ у джобі `check` після «Format, lint, test, build». Коли
// той крок падав, GitHub Actions пропускав усі наступні, і свіжість TODO не
// перевірялась узагалі — у логах це тиша, а не «прострочено». Так чотири
// прострочені цитати `TODO(0589-…)` (#69) спливли лише тоді, коли `check`
// знову позеленів, і одразу на трьох непричетних PR-ах.
//
// Тому перевіряється не «гейт існує», а саме та властивість, втрата якої й
// робила його мовчазним:
//
//   1. happy path — гейт живе у ВЛАСНІЙ джобі, без `needs:`.
//   2. регрес — гейт не повернувся кроком у `check`.
//   3. edge case — гейт не fail-open (`continue-on-error`, `|| true`,
//      `if: … false`).
//
// Парсер навмисно рядковий і без залежностей — той самий компроміс, що і в
// ci-bundle-budget-gates.test.mjs поруч.
//
// Run with:  node --test scripts/__tests__/ci-todo-freshness-gate.test.mjs

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

/** @see ci-bundle-budget-gates.test.mjs — той самий 2-space канон від prettier. */
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

/** Значення ключа `if:` кроку зі склеєними продовженнями; `null`, якщо ключа немає. */
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
    if (lineIndent <= indent || /^\s*[a-zA-Z_-]+:/.test(line)) break;
    value += " " + line.trim();
  }
  return value.trim();
}

const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf-8");
const GATE_JOB = extractJobBlock(WORKFLOW, "todo-freshness");
const CHECK_JOB = extractJobBlock(WORKFLOW, "check");

// Обидві форми виклику — прямий `node` і pnpm-обгортка — рахуються гейтом:
// тест стереже МІСЦЕ гейта, а не спосіб виклику.
const GATE_RE =
  /run:\s*(node scripts\/check-todo-freshness\.mjs|pnpm lint:todo-freshness)\s*$/m;

test("happy path: гейт свіжості TODO живе у власній джобі без needs", () => {
  assert.ok(
    GATE_JOB,
    "очікується джоба `todo-freshness:` під `jobs:` у .github/workflows/ci.yml",
  );
  const steps = extractSteps(GATE_JOB);
  assert.equal(
    steps.filter((s) => GATE_RE.test(s)).length,
    1,
    "очікується рівно один крок `check-todo-freshness.mjs` у джобі `todo-freshness`",
  );
  assert.doesNotMatch(
    GATE_JOB,
    /^\s{4}needs:/m,
    "`todo-freshness` не може мати `needs:` — залежність від `check` повертає " +
      "рівно те мовчання, заради зняття якого джоба існує (пор. `critical-flow`)",
  );
});

test("регрес, від якого цей тест і стоїть: гейт не повертається в `check`", () => {
  assert.ok(CHECK_JOB, "очікується джоба `check:` під `jobs:`");
  assert.doesNotMatch(
    CHECK_JOB,
    GATE_RE,
    "гейт свіжості TODO не має жити в `check`: там він стоїть після «Format, lint, " +
      "test, build» і мовчки не виконується, щойно той крок червоніє (#69, 2026-09-16)",
  );
});

test("edge case: гейт не fail-open", () => {
  assert.ok(GATE_JOB, "очікується джоба `todo-freshness:` (див. вище)");
  const step = extractSteps(GATE_JOB).find((s) => GATE_RE.test(s));
  assert.ok(step, "очікується крок гейта (див. вище)");

  const coe = step.match(/continue-on-error:\s*(.+)$/m);
  if (coe) {
    assert.equal(
      coe[1].trim(),
      "false",
      "`continue-on-error` допускається лише зі значенням `false` — " +
        "будь-яке інше (зокрема виразне `${{ true }}`) і є «червоний завжди = вимкнений»",
    );
  }
  assert.doesNotMatch(
    step,
    /\|\|\s*(true|exit\s+0|:)\s*$/m,
    "гейт не може мати `|| true` / `|| exit 0` втечу",
  );
  const expr = ifExpression(step);
  if (expr !== null) {
    assert.doesNotMatch(
      expr,
      /\bfalse\b/,
      "у виразі `if:` гейта не може бути літерального `false`",
    );
  }
});
