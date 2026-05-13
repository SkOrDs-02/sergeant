/**
 * Pure metric math для RAG quality gate (PR-22, WF-30 Phase 2).
 *
 * Контракт:
 *  - `recallAtK(retrieved, expected, k)` — повертає частку `expected`,
 *    що знайшлась серед топ-K `retrieved`. Domain ∈ [0, 1].
 *  - `aggregateRecall(perQueryRecall)` — mean / min / p50 / count.
 *    p50 — простий nearest-rank (не linear interpolation), бо для
 *    50-query golden-set точність interpolation-у не критична.
 *  - `classifyRecall(mean, opts?)` — порівнює з `warnThreshold=0.5` і
 *    `killThreshold=0.4` (decision-point Day 60 з pr-plan-2026-05.md).
 *
 * Цей модуль pure — без I/O, без env, без Voyage / pgvector. Тестується
 * швидко (recall.test.ts). Виклик з CLI: `scripts/eval-rag-recall.mjs`.
 */

/**
 * Recall@K — частка `expected` IDs, що знайшлась у топ-K `retrieved`.
 *
 *  recall@K = |retrieved[0..K] ∩ expected| / |expected|
 *
 * Edge cases:
 *  - `expected.length === 0` → `1` (по convention; не маємо чого шукати).
 *  - `k <= 0` → `0`.
 *  - `retrieved.length < k` → беремо все, що є (не падаємо).
 *  - Дублі у `retrieved` — інтерпретуємо як set (Set-семантика).
 *  - Дублі у `expected` — інтерпретуємо як set (унікальні цілі).
 */
export function recallAtK(
  retrieved: readonly string[],
  expected: readonly string[],
  k: number,
): number {
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

export interface RecallAggregate {
  /** Кількість оцінених запитів. */
  count: number;
  /** Середній recall (arithmetic mean). */
  mean: number;
  /** Мінімальний recall серед запитів — індикатор найгіршого випадку. */
  min: number;
  /** P50 (nearest-rank). Корисний як sanity check vs mean при skew-у. */
  p50: number;
}

/**
 * Згортка per-query recall-ів у aggregate. На вході — масив значень
 * ∈ [0, 1] (по одному на golden-query). Empty input → нульова
 * aggregate (count=0, інші = 0). Caller вище має guard-ити пустий
 * golden-set.
 */
export function aggregateRecall(
  perQueryRecall: readonly number[],
): RecallAggregate {
  if (perQueryRecall.length === 0) {
    return { count: 0, mean: 0, min: 0, p50: 0 };
  }

  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  for (const r of perQueryRecall) {
    if (r < 0 || r > 1 || !Number.isFinite(r)) {
      throw new Error(
        `aggregateRecall: per-query recall must be in [0,1], got ${r}`,
      );
    }
    sum += r;
    if (r < min) min = r;
  }

  const sorted = [...perQueryRecall].sort((a, b) => a - b);
  // Nearest-rank P50: index = ceil(0.5 * n) - 1 (0-based).
  const idx = Math.max(0, Math.ceil(0.5 * sorted.length) - 1);

  return {
    count: perQueryRecall.length,
    mean: sum / perQueryRecall.length,
    min,
    p50: sorted[idx] ?? 0,
  };
}

/**
 * Класифікація aggregate recall-у проти двох threshold-ів.
 *
 * - `mean >= warnThreshold` → `"pass"` (RAG здоровий).
 * - `mean < warnThreshold && mean >= killThreshold` → `"warn"`
 *   (degradation; відкриваємо issue, але RAG залишається ON).
 * - `mean < killThreshold` → `"kill"` (decision-point Day 60: RAG
 *   автоматично disabled через `AI_MEMORY_ENABLED=false`).
 *
 * Defaults тримаємо у sync з pr-plan-2026-05.md § Day 45 (PR-20 eval
 * results) і § Day 60 (PR-22 kill switch).
 */
export const DEFAULT_WARN_THRESHOLD = 0.5;
export const DEFAULT_KILL_THRESHOLD = 0.4;

export type RecallStatus = "pass" | "warn" | "kill";

export interface ClassifyOptions {
  warnThreshold?: number;
  killThreshold?: number;
}

export interface RecallClassification {
  status: RecallStatus;
  warnThreshold: number;
  killThreshold: number;
}

export function classifyRecall(
  mean: number,
  opts?: ClassifyOptions,
): RecallClassification {
  const warnThreshold = opts?.warnThreshold ?? DEFAULT_WARN_THRESHOLD;
  const killThreshold = opts?.killThreshold ?? DEFAULT_KILL_THRESHOLD;

  if (killThreshold > warnThreshold) {
    throw new Error(
      `classifyRecall: killThreshold (${killThreshold}) must be <= warnThreshold (${warnThreshold})`,
    );
  }
  if (!Number.isFinite(mean)) {
    throw new Error(`classifyRecall: mean must be finite, got ${mean}`);
  }

  let status: RecallStatus;
  if (mean < killThreshold) {
    status = "kill";
  } else if (mean < warnThreshold) {
    status = "warn";
  } else {
    status = "pass";
  }

  return { status, warnThreshold, killThreshold };
}

/**
 * Маппінг status → exit code для CLI. Узгоджено з
 * `.github/workflows/rag-quality-gate.yml` — workflow читає exit-code
 * щоб відкрити issue.
 */
export function statusToExitCode(status: RecallStatus): 0 | 1 | 2 {
  switch (status) {
    case "pass":
      return 0;
    case "warn":
      return 1;
    case "kill":
      return 2;
  }
}
