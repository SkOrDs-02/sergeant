#!/usr/bin/env node
// scripts/eval-rag-recall.mjs
//
// RAG quality gate CLI (PR-22, WF-30 Phase 2 — eval harness scaffold).
//
// Linked to `docs/planning/pr-plan-2026-05.md` § PR-22 «RAG quality
// gate (auto-disable RAG якщо recall@4 < 0.5)» і § Day 60 decision-
// point (kill module якщо recall@4 < 0.4).
//
// Що робить:
//   1. Завантажує golden-set із
//      `apps/server/src/__fixtures__/rag-eval/golden.json` (50 queries
//      з expected `<source>:<sourceRef>` refs у топ-K).
//   2. Для кожної query будує `retrieved[]` залежно від `--mode`:
//        - `mock` (default) — деterministic retrieval, що повертає
//          `expected` ⇒ recall@K = 1.0. Використовується у CI для
//          sanity-check, що gate не false-alarm-ить, поки PR-20 не
//          зашиплений з real-data eval.
//        - `simulate` — повертає `expected` у відсотках, заданих
//          `--simulate-recall=0.X`. Дозволяє вручну тригерити warn /
//          kill alerts через `workflow_dispatch`.
//        - `live` — викликає real AI-memory service (Voyage + pgvector).
//          Поки що NOT IMPLEMENTED — placeholder для PR-20 (`live`
//          вимагатиме `DATABASE_URL` + `VOYAGE_API_KEY`).
//   3. Обчислює recall@K per query → aggregate (mean / min / p50).
//   4. Класифікує: `pass` / `warn` (mean < warn) / `kill` (mean < kill).
//      Thresholds default: warn=0.5, kill=0.4 (узгоджено з pr-plan).
//   5. Друкує JSON summary у stdout; опційно пише у `--output=<path>`.
//   6. Exit codes: 0=pass, 1=warn, 2=kill (для CI step-conditional alert).
//
// Math (recall@K): |retrieved[0..K] ∩ expected| / |expected|.
// Дзеркало `apps/server/src/lib/ragEval/recall.ts` — для пurity-тестів
// бери TS-модуль; цей файл — runtime CLI без TS-bundling-у.
//
// Usage:
//   node scripts/eval-rag-recall.mjs                  # mock, default thresholds
//   node scripts/eval-rag-recall.mjs --mode=simulate --simulate-recall=0.45
//   node scripts/eval-rag-recall.mjs --output=eval-summary.json
//   node scripts/eval-rag-recall.mjs --warn=0.6 --kill=0.45
//
// Output format (stdout JSON):
//   {
//     "version": "1.0",
//     "mode": "mock" | "simulate" | "live",
//     "ranAt": "2026-05-13T20:00:00.000Z",
//     "topK": 4,
//     "thresholds": { "warn": 0.5, "kill": 0.4 },
//     "aggregate": { "count": 50, "mean": 1.0, "min": 1.0, "p50": 1.0 },
//     "perDomain": { "finyk": { "count": 8, "mean": 1.0 }, ... },
//     "status": "pass" | "warn" | "kill",
//     "exitCode": 0 | 1 | 2,
//     "queries": [{ "id": "...", "recall": 1.0, "domain": "..." }, ...]
//   }

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

/**
 * @typedef {Object} CliOptions
 * @property {"mock" | "simulate" | "live"} mode
 * @property {number} warn
 * @property {number} kill
 * @property {string} goldenPath
 * @property {string | null} outputPath
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
 * Симулює retrieval: повертає `expected` як retrieved, плюс N noise-IDs.
 * Якщо `targetRecall` < 1, частину `expected` витирає, щоб mean recall
 * сходив у target. Deterministic — без RNG (порядок expected).
 */
function buildRetrievedForQuery(query, mode, targetRecall, topK) {
  if (mode === "live") {
    throw new Error(
      "--mode=live not implemented (waits for PR-20 real-data eval wiring).",
    );
  }

  if (mode === "mock") {
    // Detrministic 100% recall — `expected` плюс filler-и щоб дорости до K.
    const filler = Array.from({ length: topK }, (_, i) => `noise-${i}`);
    return [...query.expected, ...filler].slice(
      0,
      Math.max(topK, query.expected.length),
    );
  }

  // simulate-mode: per-query keepCount задається caller-ом
  // (`buildSimulationPlan` нижче — global-budget approach, щоб mean
  // recall сходив у target).
  const keepN = query.simulateKeepCount ?? query.expected.length;
  const kept = query.expected.slice(0, keepN);
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
    const denom = q.expected.length;
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

  const perDomain = new Map(); // domain → number[]
  const queryResults = [];
  const perQueryRecall = [];

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
    const r = recallAtK(retrieved, q.expected, topK);
    perQueryRecall.push(r);
    queryResults.push({ id: q.id, domain: q.domain, recall: r });
    if (!perDomain.has(q.domain)) perDomain.set(q.domain, []);
    perDomain.get(q.domain).push(r);
  }

  const overall = aggregate(perQueryRecall);
  const status = classify(overall.mean, opts.warn, opts.kill);
  const exitCode = statusToExitCode(status);

  const perDomainSummary = {};
  for (const [domain, values] of perDomain.entries()) {
    perDomainSummary[domain] = aggregate(values);
  }

  const summary = {
    version: "1.0",
    mode: opts.mode,
    ranAt: new Date().toISOString(),
    topK,
    thresholds: { warn: opts.warn, kill: opts.kill },
    aggregate: overall,
    perDomain: perDomainSummary,
    status,
    exitCode,
    queries: queryResults,
  };

  const json = JSON.stringify(summary, null, 2);
  console.log(json);
  if (opts.outputPath) {
    writeFileSync(opts.outputPath, json + "\n", "utf-8");
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`[eval-rag-recall] ${err.message}`);
  process.exit(3);
});
