#!/usr/bin/env node
// scripts/eval-rag-recall.mjs
//
// RAG eval harness CLI (PR-20 § eval) + quality gate (PR-22 § weekly
// cron). Linked to `docs/planning/pr-plan-2026-05.md` § PR-20 / PR-22
// і § Day 60 decision-point (kill module якщо recall@4 < 0.4).
//
// Документація: docs/architecture/rag-eval.md (curation, formulas, baseline).
//
// Що робить:
//   1. Завантажує golden-set із
//      `apps/server/src/__fixtures__/rag-eval/golden.json` (50 queries,
//      поле `expected_memory_ids` — `<source>:<sourceRef>` refs).
//   2. Для кожної query будує `retrieved[]` залежно від `--mode`:
//        - `mock` (default) — deterministic retrieval, що повертає
//          `expected` ⇒ recall@K = 1.0 і RR = 1.0 (P@1 = 1).
//          Sanity-check CI; gate не false-alarm-ить до PR-21.
//        - `simulate` — повертає `expected` у відсотках, заданих
//          `--simulate-recall=0.X`. Manually тригерити warn / kill.
//        - `live` — real AI-memory service (Voyage + pgvector). NOT
//          IMPLEMENTED — placeholder для PR-21 (`live` вимагає
//          `DATABASE_URL` + `VOYAGE_API_KEY`).
//   3. Обчислює три метрики per query:
//        - recall@K = |retrieved[0..K] ∩ expected| / |expected|
//        - precision@1 = 1 якщо retrieved[0] ∈ expected else 0
//        - reciprocal_rank = 1 / (rank першого hit-у у retrieved); 0
//          якщо жоден expected не знайдений.
//      Aggregate — mean / min / p50 по кожній метриці (MRR =
//      mean reciprocal_rank).
//   4. Класифікує quality gate за recall@K mean:
//      `pass` / `warn` (mean < warn) / `kill` (mean < kill).
//      Defaults: warn=0.5, kill=0.4.
//   5. Опційно порівнює з baseline (`--baseline=<path>`):
//      `delta` по трьох метриках + flag `regression` якщо
//      recall@K mean провалився більше ніж на 0.05.
//   6. Друкує JSON summary у stdout; опційно пише у `--output=<path>`.
//   7. Exit codes: 0=pass, 1=warn, 2=kill, 3=error.
//
// Дзеркало formulas: `apps/server/src/lib/ragEval/recall.ts` — unit-
// тести бери з TS-модуля; цей файл — runtime CLI без TS-bundling-у.
//
// Usage:
//   pnpm eval:rag                                       # alias
//   node scripts/eval-rag-recall.mjs                    # mock, defaults
//   node scripts/eval-rag-recall.mjs --mode=simulate --simulate-recall=0.45
//   node scripts/eval-rag-recall.mjs --output=eval-summary.json
//   node scripts/eval-rag-recall.mjs --warn=0.6 --kill=0.45
//   node scripts/eval-rag-recall.mjs --baseline=prev-summary.json

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Дефолтний шлях до canonical fixture. Override-итись через
// `--golden=<path>` (зручно для unit-тестів і ad-hoc evals).
const DEFAULT_GOLDEN_PATH = resolve(
  REPO_ROOT,
  "apps/server/src/__fixtures__/rag-eval/golden.json",
);

const DEFAULT_WARN_THRESHOLD = 0.5;
const DEFAULT_KILL_THRESHOLD = 0.4;
/** Delta beyond which a baseline-comparison flags `regression: true`. */
const BASELINE_REGRESSION_DELTA = 0.05;

/**
 * @typedef {Object} CliOptions
 * @property {"mock" | "simulate" | "live"} mode
 * @property {number} warn
 * @property {number} kill
 * @property {string} goldenPath
 * @property {string | null} outputPath
 * @property {string | null} baselinePath
 * @property {number} simulateRecall  // ∈ [0,1], коли mode=simulate
 */

/**
 * Parse CLI args. Підтримує `--key=value` і `--key value`.
 * @returns {CliOptions}
 */
function parseArgs(argv) {
  const opts = {
    mode: "mock",
    warn: DEFAULT_WARN_THRESHOLD,
    kill: DEFAULT_KILL_THRESHOLD,
    goldenPath: DEFAULT_GOLDEN_PATH,
    outputPath: null,
    baselinePath: null,
    simulateRecall: 1.0,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    let key;
    let value;
    if (arg.includes("=")) {
      const eq = arg.indexOf("=");
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      value = argv[i + 1];
      i++;
    }

    switch (key) {
      case "mode":
        if (value !== "mock" && value !== "simulate" && value !== "live") {
          throw new Error(`Invalid --mode: ${value}. Use mock|simulate|live.`);
        }
        opts.mode = value;
        break;
      case "warn":
        opts.warn = Number(value);
        if (!Number.isFinite(opts.warn) || opts.warn < 0 || opts.warn > 1) {
          throw new Error(`Invalid --warn: ${value} (must be in [0,1])`);
        }
        break;
      case "kill":
        opts.kill = Number(value);
        if (!Number.isFinite(opts.kill) || opts.kill < 0 || opts.kill > 1) {
          throw new Error(`Invalid --kill: ${value} (must be in [0,1])`);
        }
        break;
      case "golden":
        opts.goldenPath = resolve(process.cwd(), value);
        break;
      case "output":
        opts.outputPath = resolve(process.cwd(), value);
        break;
      case "baseline":
        opts.baselinePath = resolve(process.cwd(), value);
        break;
      case "simulate-recall":
        opts.simulateRecall = Number(value);
        if (
          !Number.isFinite(opts.simulateRecall) ||
          opts.simulateRecall < 0 ||
          opts.simulateRecall > 1
        ) {
          throw new Error(`Invalid --simulate-recall: ${value}`);
        }
        break;
      case "help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: --${key}`);
    }
  }

  if (opts.kill > opts.warn) {
    throw new Error(`--kill (${opts.kill}) must be <= --warn (${opts.warn})`);
  }

  return opts;
}

function printHelp() {
  console.log(
    [
      "Usage: node scripts/eval-rag-recall.mjs [options]",
      "",
      "Options:",
      "  --mode=mock|simulate|live   Retrieval mode (default: mock).",
      "  --simulate-recall=<0..1>    For --mode=simulate: target recall.",
      "  --warn=<0..1>               Warn threshold (default: 0.5).",
      "  --kill=<0..1>               Kill threshold (default: 0.4).",
      "  --golden=<path>             Golden-set fixture path.",
      "  --output=<path>             Write JSON summary to file.",
      "  --baseline=<path>           Compare summary against prior baseline JSON.",
      "  --help                      Show this help.",
      "",
      "Exit codes: 0=pass, 1=warn, 2=kill.",
    ].join("\n"),
  );
}

/**
 * recall@K — pure math (дзеркало apps/server/src/lib/ragEval/recall.ts).
 * @param {string[]} retrieved
 * @param {string[]} expected
 * @param {number} k
 */
function recallAtK(retrieved, expected, k) {
  if (expected.length === 0) return 1;
  if (k <= 0) return 0;
  const topK = new Set(retrieved.slice(0, k));
  const expectedSet = new Set(expected);
  let hits = 0;
  for (const id of expectedSet) {
    if (topK.has(id)) hits += 1;
  }
  return hits / expectedSet.size;
}

/**
 * Precision@1 — 1 якщо retrieved[0] ∈ expected, інакше 0.
 * Дзеркало `apps/server/src/lib/ragEval/recall.ts → precisionAt1`.
 * @param {string[]} retrieved
 * @param {string[]} expected
 */
function precisionAt1(retrieved, expected) {
  if (expected.length === 0) return 1;
  if (retrieved.length === 0) return 0;
  return new Set(expected).has(retrieved[0]) ? 1 : 0;
}

/**
 * Reciprocal rank — 1 / (rank першого hit-у), rank 1-indexed.
 * Дзеркало `apps/server/src/lib/ragEval/recall.ts → reciprocalRank`.
 * @param {string[]} retrieved
 * @param {string[]} expected
 */
function reciprocalRank(retrieved, expected) {
  if (expected.length === 0) return 1;
  if (retrieved.length === 0) return 0;
  const expectedSet = new Set(expected);
  for (let i = 0; i < retrieved.length; i++) {
    if (expectedSet.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Симулює retrieval: повертає `expected` як retrieved, плюс N noise-IDs.
 * Якщо `targetRecall` < 1, частину `expected` витирає, щоб mean recall
 * сходив у target. Deterministic — без RNG (порядок expected).
 */
function buildRetrievedForQuery(query, mode, targetRecall, topK) {
  if (mode === "live") {
    throw new Error(
      "--mode=live not implemented (waits for PR-21 real-data eval wiring).",
    );
  }

  const expected = query.expected_memory_ids;

  if (mode === "mock") {
    // Detrministic 100% recall — `expected` плюс filler-и щоб дорости до K.
    const filler = Array.from({ length: topK }, (_, i) => `noise-${i}`);
    return [...expected, ...filler].slice(0, Math.max(topK, expected.length));
  }

  // simulate-mode: per-query keepCount задається caller-ом
  // (`buildSimulationPlan` нижче — global-budget approach, щоб mean
  // recall сходив у target).
  const keepN = query.simulateKeepCount ?? expected.length;
  const kept = expected.slice(0, keepN);
  const noise = Array.from(
    { length: Math.max(0, topK - kept.length) },
    (_, i) => `noise-${query.id}-${i}`,
  );
  return [...kept, ...noise];
}

/**
 * Розподіляє per-query `simulateKeepCount` так, щоб глобальна mean
 * recall сходила приблизно у `targetRecall`. Per-query rounding (ceil/
 * floor) спотворює target на малих expected.length, тому ми йдемо
 * через **глобальний бюджет** "скільки expected items загалом hit-нути"
 * і розподіляємо по queries у порядку появи (детермінованo).
 */
function buildSimulationPlan(queries, targetRecall) {
  // Бюджет — сума recall@K по всіх queries (mean = sum / count).
  // Тобто треба так розподілити keepCount-и, щоб
  //   Σ (keepCount[i] / |expected[i]|) ≈ targetRecall * count.
  // Це NP-hard у загальному, але приблизне рішення достатнє: ми
  // ідемо queries у порядку, накопичуємо досягнутий сум-recall, і
  // в кожній query вибираємо keepCount, що мінімізує |current/i+1 -
  // target|. Це детерміновано і дає mean ∈ [target ± 0.05] для
  // golden-set-у з 50 queries.
  let achievedRecallSum = 0;
  return queries.map((q, i) => {
    const denom = q.expected_memory_ids.length;
    const desiredRunningMean = targetRecall * (i + 1);
    let bestKeep = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let keep = 0; keep <= denom; keep++) {
      const projectedSum = achievedRecallSum + keep / denom;
      const delta = Math.abs(projectedSum - desiredRunningMean);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestKeep = keep;
      }
    }
    achievedRecallSum += bestKeep / denom;
    return { ...q, simulateKeepCount: bestKeep };
  });
}

/**
 * Mean / min / p50 (nearest-rank). Дзеркало `aggregateRecall` з TS-модуля.
 */
function aggregate(perQuery) {
  if (perQuery.length === 0) return { count: 0, mean: 0, min: 0, p50: 0 };
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  for (const r of perQuery) {
    sum += r;
    if (r < min) min = r;
  }
  const sorted = [...perQuery].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil(0.5 * sorted.length) - 1);
  return {
    count: perQuery.length,
    mean: sum / perQuery.length,
    min,
    p50: sorted[idx] ?? 0,
  };
}

function classify(mean, warn, kill) {
  if (mean < kill) return "kill";
  if (mean < warn) return "warn";
  return "pass";
}

function statusToExitCode(status) {
  if (status === "pass") return 0;
  if (status === "warn") return 1;
  return 2;
}

/**
 * Main entrypoint. Returns the summary object і robить process.exit(code).
 */
async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const raw = JSON.parse(readFileSync(opts.goldenPath, "utf-8"));
  if (!Array.isArray(raw.queries) || raw.queries.length === 0) {
    throw new Error(`Golden set has no queries: ${opts.goldenPath}`);
  }
  const topK = Number(raw.topK ?? 4);
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error(`Invalid topK in golden set: ${raw.topK}`);
  }

  const perDomain = new Map(); // domain → PerQueryMetrics[]
  const queryResults = [];
  const perQueryMetrics = [];

  // У simulate-mode рознесли keepCount-и заздалегідь, щоб глобальна
  // mean recall зійшлась у targetRecall. У mock-mode plan === queries.
  const planned =
    opts.mode === "simulate"
      ? buildSimulationPlan(raw.queries, opts.simulateRecall)
      : raw.queries;

  for (const q of planned) {
    const retrieved = buildRetrievedForQuery(
      q,
      opts.mode,
      opts.simulateRecall,
      topK,
    );
    const expected = q.expected_memory_ids;
    const r = recallAtK(retrieved, expected, topK);
    const p1 = precisionAt1(retrieved, expected);
    const rr = reciprocalRank(retrieved, expected);
    const metrics = { recall: r, precisionAt1: p1, reciprocalRank: rr };
    perQueryMetrics.push(metrics);
    queryResults.push({
      id: q.id,
      domain: q.domain,
      recall: r,
      precisionAt1: p1,
      reciprocalRank: rr,
    });
    if (!perDomain.has(q.domain)) perDomain.set(q.domain, []);
    perDomain.get(q.domain).push(metrics);
  }

  const bundle = aggregateBundle(perQueryMetrics);
  const status = classify(bundle.recallAtK.mean, opts.warn, opts.kill);
  const exitCode = statusToExitCode(status);

  const perDomainSummary = {};
  for (const [domain, values] of perDomain.entries()) {
    perDomainSummary[domain] = aggregateBundle(values);
  }

  /** @type {{baselinePath:string,deltas:object,regression:boolean}|null} */
  let comparison = null;
  if (opts.baselinePath) {
    comparison = compareToBaseline(opts.baselinePath, bundle);
  }

  const summary = {
    version: "2.0",
    mode: opts.mode,
    ranAt: new Date().toISOString(),
    topK,
    thresholds: { warn: opts.warn, kill: opts.kill },
    /** Primary signal — mean recall@K узгоджено з PR-22 workflow.       */
    aggregate: bundle.recallAtK,
    /** PR-20 secondary signals — P@1 і MRR (mean reciprocal rank).         */
    metrics: bundle,
    perDomain: perDomainSummary,
    status,
    exitCode,
    queries: queryResults,
    baselineComparison: comparison,
  };

  const json = JSON.stringify(summary, null, 2);
  console.log(json);
  if (opts.outputPath) {
    writeFileSync(opts.outputPath, json + "\n", "utf-8");
  }

  process.exit(exitCode);
}

/**
 * Aggregate всіх трьох метрик (recall@K, P@1, MRR) з per-query bundle.
 * Дзеркало `aggregateMetrics` у TS-модулі.
 */
function aggregateBundle(perQuery) {
  return {
    recallAtK: aggregate(perQuery.map((q) => q.recall)),
    precisionAt1: aggregate(perQuery.map((q) => q.precisionAt1)),
    mrr: aggregate(perQuery.map((q) => q.reciprocalRank)),
  };
}

/**
 * Читає baseline JSON і порівнює три метрики (recall@K mean, P@1
 * mean, MRR). Флаг `regression` — true якщо recall@K mean провалився
 * більше ніж на BASELINE_REGRESSION_DELTA. На missing baseline раннє
 * повертаємо null (caller вже зберіг baseline-flag як guard).
 */
function compareToBaseline(baselinePath, current) {
  /** @type {any} */
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));
  } catch (err) {
    throw new Error(`Failed to read baseline ${baselinePath}: ${err.message}`);
  }
  // Підтримуємо обидві версії summary: 1.0 (only `aggregate`) i 2.0
  // (`metrics.recallAtK/precisionAt1/mrr`). Старі baseline-и падають в
  // graceful-fallback.
  const recallMeanPrev =
    baseline?.metrics?.recallAtK?.mean ?? baseline?.aggregate?.mean ?? 0;
  const p1MeanPrev = baseline?.metrics?.precisionAt1?.mean ?? 0;
  const mrrPrev = baseline?.metrics?.mrr?.mean ?? 0;

  const recallDelta = current.recallAtK.mean - recallMeanPrev;
  return {
    baselinePath,
    deltas: {
      recallAtK: round(recallDelta, 4),
      precisionAt1: round(current.precisionAt1.mean - p1MeanPrev, 4),
      mrr: round(current.mrr.mean - mrrPrev, 4),
    },
    regression: recallDelta < -BASELINE_REGRESSION_DELTA,
  };
}

function round(n, digits) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

main().catch((err) => {
  console.error(`[eval-rag-recall] ${err.message}`);
  process.exit(3);
});
