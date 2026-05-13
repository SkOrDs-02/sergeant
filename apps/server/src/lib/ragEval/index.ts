/**
 * Barrel для RAG-eval модуля (PR-22 quality gate).
 *
 * Caller-и (CLI `scripts/eval-rag-recall.mjs`, future PR-20 real-data eval)
 * мають імпортувати лише звідси.
 *
 * @scaffolded — PR-20 (RAG eval harness, landed 2026-05-13) shipped the
 *   barrel ahead of the real-data caller; CLI `eval-rag-recall.mjs` will
 *   wire imports here once the golden-set is finalised.
 * @nextStep Wire `scripts/eval-rag-recall.mjs` to import from this barrel
 *   (drop direct `./recall.js` deep-import). Tracked in PR-22 quality gate.
 */

export {
  DEFAULT_KILL_THRESHOLD,
  DEFAULT_WARN_THRESHOLD,
  aggregateMetrics,
  aggregateRecall,
  classifyRecall,
  precisionAt1,
  recallAtK,
  reciprocalRank,
  statusToExitCode,
} from "./recall.js";
export type {
  ClassifyOptions,
  MetricsBundle,
  PerQueryMetrics,
  RecallAggregate,
  RecallClassification,
  RecallStatus,
} from "./recall.js";

export {
  GoldenQuerySchema,
  GoldenSetSchema,
  loadDefaultGoldenSet,
  parseGoldenSet,
} from "./golden.js";
export type { GoldenQuery, GoldenSet } from "./golden.js";
