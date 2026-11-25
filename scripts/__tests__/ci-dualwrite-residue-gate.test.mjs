// scripts/__tests__/ci-dualwrite-residue-gate.test.mjs
//
// Shape-regression test for the dual-write residue guard in
// `.github/workflows/ci.yml` (job `check`).
//
// `scripts/dualwrite-residue.ts` (`pnpm check:dualwrite-residue`) стереже
// baseline після «Phase 5 teardown» ADR-0073: прямі LS/MMKV-ключі модулів і
// читання tombstoned-ключів повз dualwrite-core. Аж до 2026-11-21 його не
// викликав жоден прогін — лише ручний `pnpm`-скрипт (аудит сирітського коду
// 2026-08-05, § 1: «не підключений ні до CI, ні до turbo»). Гейт, якого
// ніхто не запускає, мовчить так само, як зелений.
//
// Тест стереже три властивості:
//
//   1. happy path — рівно один крок гварда в джобі `check`.
//   2. регрес — крок стоїть ДО «Format, lint, test, build»: після нього
//      гейт мовчить, щойно той червоніє (той самий клас, що й
//      ci-bundle-budget-gates / ci-todo-freshness-gate поруч).
//   3. edge case — гейт не fail-open (`continue-on-error`, `|| true`,
//      `if: … false`).
//
// Парсер рядковий і без залежностей — той самий компроміс, що і в
// ci-todo-freshness-gate.test.mjs.
//
// Run with:  node --test scripts/__tests__/ci-dualwrite-residue-gate.test.mjs

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
const CHECK_JOB = extractJobBlock(WORKFLOW, "check");
const CHECK_STEPS = CHECK_JOB ? extractSteps(CHECK_JOB) : [];

// Обидві форми виклику — pnpm-обгортка і прямий `tsx` — рахуються гейтом:
// тест стереже МІСЦЕ гейта, а не спосіб виклику.
const GATE_RE =
  /run:\s*(pnpm check:dualwrite-residue|(pnpm exec )?tsx scripts\/dualwrite-residue\.ts)\s*$/m;
const BUILD_RE = /^ {6}- name:\s*Format, lint, test, build\s*$/m;

test("happy path: гвард dual-write residue є кроком у джобі `check`", () => {
  assert.ok(CHECK_JOB, "очікується джоба `check:` під `jobs:` у ci.yml");
  assert.equal(
    CHECK_STEPS.filter((s) => GATE_RE.test(s)).length,
    1,
    "очікується рівно один крок `pnpm check:dualwrite-residue` у джобі `check` " +
      "(аудит 2026-08-05 § 1: гвард не викликав жоден прогін)",
  );
});

test("регрес: гвард стоїть до «Format, lint, test, build»", () => {
  const gateIdx = CHECK_STEPS.findIndex((s) => GATE_RE.test(s));
  const buildIdx = CHECK_STEPS.findIndex((s) => BUILD_RE.test(s));
  assert.notEqual(gateIdx, -1, "очікується крок гварда (див. вище)");
  assert.notEqual(
    buildIdx,
    -1,
    "очікується крок «Format, lint, test, build» у `check`",
  );
  assert.ok(
    gateIdx < buildIdx,
    "гвард після «Format, lint, test, build» мовчки не виконується, щойно " +
      "той крок червоніє — став його вище",
  );
});

test("edge case: гвард не fail-open", () => {
  const step = CHECK_STEPS.find((s) => GATE_RE.test(s));
  assert.ok(step, "очікується крок гварда (див. вище)");

  const coe = step.match(/continue-on-error:\s*(.+)$/m);
  if (coe) {
    assert.equal(
      coe[1].trim(),
      "false",
      "`continue-on-error` допускається лише зі значенням `false`",
    );
  }
  assert.doesNotMatch(
    step,
    /\|\|\s*(true|exit\s+0|:)\s*$/m,
    "гвард не може мати `|| true` / `|| exit 0` втечу",
  );
  const expr = ifExpression(step);
  if (expr !== null) {
    assert.doesNotMatch(
      expr,
      /\bfalse\b/,
      "у виразі `if:` гварда не може бути літерального `false`",
    );
  }
});
