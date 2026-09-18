// scripts/ci/__tests__/mutation-ratchet.test.mjs
//
// Unit-тести чистих helper-ів mutation-ratchet гейта (node --test, без
// фікстур на диску — файлова робота живе лише в main()). Запускається
// pre-flight кроком у job `mutation-ratchet`
// (.github/workflows/mutation-testing.yml), щоб зламаний helper падав до
// того, як гейт почне вирішувати долю weekly-прогону.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  tallyMutants,
  mutationScoreFromCounts,
  computeReportScore,
  evaluateRatchet,
  applyBumps,
  renderSummaryMarkdown,
  parseArgs,
} from "../mutation-ratchet.mjs";

/** Синтетичний Stryker-звіт: масив статусів → структура mutation-testing-elements. */
function reportOf(statusesByFile) {
  const files = {};
  for (const [file, statuses] of Object.entries(statusesByFile)) {
    files[file] = {
      language: "typescript",
      source: "",
      mutants: statuses.map((status, i) => ({
        id: `${file}#${i}`,
        mutatorName: "ConditionalExpression",
        status,
      })),
    };
  }
  return { schemaVersion: "1.0", thresholds: { high: 80, low: 70 }, files };
}

// ── Обчислення score ─────────────────────────────────────────────────────────

test("score: канонічна формула (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage)", () => {
  const report = reportOf({
    "src/a.ts": ["Killed", "Killed", "Timeout", "Survived"],
    "src/b.ts": ["Killed", "NoCoverage"],
  });
  // detected = 4 (3 Killed + 1 Timeout), знаменник = 6 → 66.67%
  const { score, total } = computeReportScore(report);
  assert.equal(score, 66.67);
  assert.equal(total, 6);
});

test("score: Ignored і CompileError не входять у знаменник", () => {
  const withNoise = reportOf({
    "src/a.ts": [
      "Killed",
      "Survived",
      "Ignored",
      "Ignored",
      "CompileError",
      "CompileError",
    ],
  });
  // 1 / (1 + 1) = 50%, шість мутантів усього, але знаменник — два
  const { score, total, counts } = computeReportScore(withNoise);
  assert.equal(score, 50);
  assert.equal(total, 6);
  assert.equal(counts.Ignored, 2);
});

test("score: Timeout зараховується як виявлений мутант", () => {
  const { score } = computeReportScore(
    reportOf({ "src/a.ts": ["Timeout", "Timeout", "Survived", "Survived"] }),
  );
  assert.equal(score, 50);
});

test("edge: усі мутанти Ignored → знаменник 0 → score null", () => {
  const { score } = computeReportScore(
    reportOf({ "src/a.ts": ["Ignored", "Ignored", "CompileError"] }),
  );
  assert.equal(score, null);
});

test("edge: лише NoCoverage → 0%, а не null (знаменник ненульовий)", () => {
  const { score } = computeReportScore(
    reportOf({ "src/a.ts": ["NoCoverage", "NoCoverage"] }),
  );
  assert.equal(score, 0);
});

test("edge: порожній звіт (files = {}) → score null", () => {
  assert.equal(computeReportScore({ files: {} }).score, null);
  assert.equal(computeReportScore({}).score, null);
  assert.equal(computeReportScore(undefined).score, null);
});

test("edge: файл без mutants не ламає тальку", () => {
  const counts = tallyMutants({ "src/a.ts": {}, "src/b.ts": null });
  assert.deepEqual(counts, {});
  assert.equal(mutationScoreFromCounts(counts), null);
});

test("score: 100% коли всі вбиті", () => {
  assert.equal(
    mutationScoreFromCounts({ Killed: 12, Timeout: 3, Ignored: 4 }),
    100,
  );
});

// ── Порівняння з baseline ────────────────────────────────────────────────────

const baseline = {
  epsilonPp: 0.5,
  targets: {
    utils: { report: "a.json", score: 92.3 },
    normalizers: { report: "b.json", score: 78.1 },
    core: { report: "c.json", score: null },
  },
};

test("pass: actual у сірій зоні (baseline ± epsilon)", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    utils: 92.0,
    normalizers: 78.5,
    core: 61.0,
  });
  assert.deepEqual(failures, []);
  // core має null-baseline → потрапляє у bumps як «є що записати»,
  // але не є failure.
  assert.deepEqual(bumps, { core: 61.0 });
});

test("fail: просідання понад epsilon", () => {
  const { failures } = evaluateRatchet(baseline, {
    utils: 91.79,
    normalizers: 78.1,
    core: 61.0,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /utils/);
  assert.match(failures[0], /91\.79%/);
});

test("межа: рівно baseline − epsilon ще проходить", () => {
  const { failures } = evaluateRatchet(baseline, {
    utils: 91.8,
    normalizers: 77.6,
    core: null,
  });
  assert.deepEqual(failures, []);
});

test("no-bump: приріст у межах epsilon не бампить (без шуму)", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    utils: 92.7, // +0.4 над 92.3 — менше за epsilon 0.5
    normalizers: 78.1,
    core: null,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(bumps, {});
});

test("bump: зростання понад epsilon — тільки для таргета, що виріс", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    utils: 95.42,
    normalizers: 78.1,
    core: null,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(bumps, { utils: 95.42 });

  const updated = applyBumps(baseline, bumps);
  assert.equal(updated.targets.utils.score, 95.42);
  assert.equal(updated.targets.normalizers.score, 78.1);
  assert.equal(updated.targets.core.score, null);
  // Вхідний обʼєкт не мутується, решта полів запису збережена.
  assert.equal(baseline.targets.utils.score, 92.3);
  assert.equal(updated.targets.utils.report, "a.json");
});

test("null baseline: score друкується, гейт проходить (не failure)", () => {
  const { failures, bumps, report, rows } = evaluateRatchet(baseline, {
    utils: 92.3,
    normalizers: 78.1,
    core: 88.88,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(bumps, { core: 88.88 });
  assert.ok(report.some((l) => l.includes("core") && l.includes("88.88%")));
  const coreRow = rows.find((r) => r.target === "core");
  assert.equal(coreRow.baseline, null);
  assert.equal(coreRow.actual, 88.88);
});

test("null baseline + null actual: пропуск без failure", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    utils: 92.3,
    normalizers: 78.1,
    core: null,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(bumps, {});
});

test("fail-closed: baseline є, а score не обчислився (знаменник 0)", () => {
  const { failures } = evaluateRatchet(baseline, {
    utils: null,
    normalizers: 78.1,
    core: null,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /utils/);
  assert.match(failures[0], /знаменник 0/);
});

test("fail-closed: таргет узагалі відсутній в actuals", () => {
  const { failures } = evaluateRatchet(baseline, { normalizers: 78.1 });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /utils/);
});

test("одночасно fail і bump у різних таргетах", () => {
  const { failures, bumps } = evaluateRatchet(baseline, {
    utils: 50,
    normalizers: 90,
    core: null,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /utils/);
  assert.deepEqual(bumps, { normalizers: 90 });
});

// ── Step summary ─────────────────────────────────────────────────────────────

test("summary: рендер таблиці з прочерком для невиміряного baseline", () => {
  const md = renderSummaryMarkdown([
    { target: "utils", actual: 92.3, baseline: 92.3, verdict: "✅ ок" },
    {
      target: "core",
      actual: 88.88,
      baseline: null,
      verdict: "baseline не встановлено",
    },
  ]);
  assert.match(md, /## Mutation ratchet/);
  assert.match(md, /\| `utils` \| 92\.3% \| 92\.3% \| ✅ ок \|/);
  assert.match(md, /\| `core` \| 88\.88% \| — \|/);
});

// ── CLI-прапорці ─────────────────────────────────────────────────────────────

test("args: дефолт — ні check-only, ні bump, без перекриттів", () => {
  assert.deepEqual(parseArgs([]), {
    checkOnly: false,
    bump: false,
    overrides: {},
  });
});

test("args: --report у двох формах", () => {
  assert.deepEqual(parseArgs(["--report=utils=/tmp/a/mutation-report.json"]), {
    checkOnly: false,
    bump: false,
    overrides: { utils: "/tmp/a/mutation-report.json" },
  });
  assert.deepEqual(
    parseArgs(["--check-only", "--report", "core=/tmp/c"]).overrides,
    { core: "/tmp/c" },
  );
});

test("args: --check-only і --bump взаємовиключні", () => {
  assert.throws(() => parseArgs(["--check-only", "--bump"]), /взаємовиключні/);
});

test("args: невідомий аргумент — помилка, а не тихе ігнорування", () => {
  assert.throws(() => parseArgs(["--yolo"]), /Невідомий аргумент/);
});
