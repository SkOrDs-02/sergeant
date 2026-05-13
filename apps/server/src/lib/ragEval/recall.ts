/**
 * Pure metric math для RAG quality gate (PR-22) + eval harness (PR-20).
 *
 * Контракт:
 *  - `recallAtK(retrieved, expected, k)` — частка `expected`,
 *    що знайшлась серед топ-K `retrieved`. Domain ∈ [0, 1].
 *  - `precisionAt1(retrieved, expected)` — 1 якщо `retrieved[0]` ∈
 *    expected, інакше 0. Сигнал "найрелевантніший hit на позиції 1".
 *  - `reciprocalRank(retrieved, expected)` — 1 / rank-of-first-hit
 *    (rank 1-indexed); 0 якщо жоден `expected` не знайдений у
 *    `retrieved`. PR-20 quality-of-ordering metric.
 *  - `aggregateRecall(perQueryRecall)` — mean / min / p50 / count.
 *  - `aggregateRecallSet(queries)` — paralel-aggregate recall@K + P@1 +
 *    MRR в одному проходi для CLI summary.
 *  - `classifyRecall(mean, opts?)` — порівнює з `warnThreshold=0.5` і
 *    `killThreshold=0.4` (decision-point Day 60 pr-plan-2026-05.md).
 *
 * Цей модуль pure — без I/O, env, Voyage / pgvector. Тестується швидко
 * (recall.test.ts). Виклик з CLI: `scripts/eval-rag-recall.mjs`.
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

/**
 * Precision@1 — 1 якщо найвищий retrieved (топ-1) є у `expected`, інакше
 * 0. Найжорсткіший recall-metric: чи найвищий-ranked-result релевантний?
 *
 * Edge cases:
 *  - `expected.length === 0` → 1 (нема чого шукати, top-1 trivially OK).
 *  - `retrieved.length === 0` → 0 (нема що оцінити).
 */
export function precisionAt1(
  retrieved: readonly string[],
  expected: readonly string[],
): 0 | 1 {
  if (expected.length === 0) return 1;
  if (retrieved.length === 0) return 0;
  const top = retrieved[0];
  if (top === undefined) return 0;
  return new Set(expected).has(top) ? 1 : 0;
}

/**
 * Reciprocal rank — 1 / (rank of first expected hit), rank 1-indexed.
 *  - Якщо `expected[0]` знайдений на позиції 1 у retrieved → RR = 1.0.
 *  - На позиції 2 → RR = 0.5; на позиції 4 → RR = 0.25.
 *  - Якщо жоден expected не знайдений → RR = 0.
 *  - `expected.length === 0` → 1 (no-op, treat as perfect).
 *
 * MRR (Mean Reciprocal Rank) — `aggregateScalar` усіх per-query RR.
 * Метрика чутлива до **порядку**, на відміну від recall@K, що дивиться
 * лише на membership у top-K set.
 */
export function reciprocalRank(
  retrieved: readonly string[],
  expected: readonly string[],
): number {
  if (expected.length === 0) return 1;
  if (retrieved.length === 0) return 0;
  const expectedSet = new Set(expected);
  for (let i = 0; i < retrieved.length; i++) {
    const item = retrieved[i];
    if (item !== undefined && expectedSet.has(item)) {
      return 1 / (i + 1);
    }
  }
  return 0;
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
 * Per-query metrics — повна тройка для PR-20 eval reporting. CLI
 * рахує це для кожної golden-query і aggregateляє у `MetricsBundle`.
 */
export interface PerQueryMetrics {
  recall: number;
  precisionAt1: 0 | 1;
  reciprocalRank: number;
}

/**
 * Bundle усіх трьох aggregate metrics. `recallAtK` (mean recall@K) —
 * primary signal для quality gate; `precisionAt1` і `mrr` — secondary
 * сигнали для root-cause investigation (recall високий, але P@1
 * низький → ordering broken; MRR низький → relevant items занадто
 * глибоко у списку).
 */
export interface MetricsBundle {
  recallAtK: RecallAggregate;
  precisionAt1: RecallAggregate;
  /** Mean Reciprocal Rank — aggregate.mean з recipRanks-у. */
  mrr: RecallAggregate;
}

/**
 * Одночасний aggregate трьох метрик з масиву per-query measurements.
 * Дзеркало JS-implementation у `scripts/eval-rag-recall.mjs`.
 */
export function aggregateMetrics(
  perQuery: readonly PerQueryMetrics[],
): MetricsBundle {
  return {
    recallAtK: aggregateRecall(perQuery.map((q) => q.recall)),
    precisionAt1: aggregateRecall(perQuery.map((q) => q.precisionAt1)),
    mrr: aggregateRecall(perQuery.map((q) => q.reciprocalRank)),
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
