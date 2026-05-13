/**
 * Barrel для RAG-eval модуля (PR-22 quality gate).
 *
 * Caller-и (CLI `scripts/eval-rag-recall.mjs`, future PR-20 real-data eval)
 * мають імпортувати лише звідси.
 */

export {
  DEFAULT_KILL_THRESHOLD,
  DEFAULT_WARN_THRESHOLD,
  aggregateRecall,
  classifyRecall,
  recallAtK,
  statusToExitCode,
} from "./recall.js";
export type {
  ClassifyOptions,
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
