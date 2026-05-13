/**
 * Status: Active.
 *
 * In-memory FIFO buffer для unknown-MCC tx-ів, які `lookupMccCategory()`
 * не зміг резолвити детерміністично. Буфер дренують hourly-batch worker-и
 * (PR-18 з pr-plan-2026-05, WF-06 mono optimization): замість per-row
 * Anthropic-виклик-у на кожну tx ми накопичуємо їх і шлемо одним батчем
 * раз на годину — на порядки дешевше.
 *
 * Архітектура:
 *   * Буфер — `Array<UnknownMccItem>` у пам'яті одного процесу. Multi-replica
 *     setup-у не передбачаємо (Railway api-service працює у 1 replica для
 *     цього сервісу); якщо колись з'явиться 2+, треба буде перенести на
 *     Redis / DB-таблицю.
 *   * Producer — `enqueueUnknownMcc()` з `enrichmentWorker.ts::runEnrichmentTick`,
 *     коли `MCC_BATCH_HOURLY_ENABLED=true` і MCC не зматчився rule-based.
 *   * Consumer — `runMccBatchTick()` у `batchEnrichmentWorker.ts`, який
 *     дренаж робить atomically через `drainBatch(maxSize)`.
 *   * Overflow protection: якщо буфер досягає `MCC_BATCH_MAX_SIZE × 10`
 *     (10× headroom для випадків коли batch-tick впав і черга «налазить»),
 *     `enqueueUnknownMcc()` повертає `false` — caller свідомо НЕ enqueue-ить
 *     і фолбекає на per-row Anthropic-виклик (existing behaviour).
 *   * Idempotency: ми не дедуплікуємо по `monoTxId` всередині буфера —
 *     виклики `enqueueUnknownMcc()` гарантуються при `FOR UPDATE SKIP
 *     LOCKED` SELECT-і у enrichment-worker-і, тож дубль одного `monoTxId`
 *     у пам'яті в один момент часу — це bug у caller-і, а не у буфер-і.
 *
 * Тестабельність:
 *   * Буфер — module-scoped singleton, але ми експонуємо `__resetForTests()`
 *     для unit-тестів (Vitest, `beforeEach`).
 *   * Жодних таймерів / async-операцій всередині — це чистий FIFO.
 */

import { monoMccBufferDepth } from "../../obs/metrics.js";

export interface UnknownMccItem {
  /** Primary key `mono_ai_enrichment_queue.id` — потрібен для write-back. */
  queueId: number;
  /** Better Auth opaque user id (TEXT-колонка, НЕ bigint — Hard Rule #1). */
  userId: string;
  /** Monobank tx id (TEXT-колонка). */
  monoTxId: string;
  /** PII-masked description — НЕ raw text, бо пройде у Anthropic-prompt. */
  description: string;
  /** Сума у kopiykas (minor units) — `number`, не string. Може бути NULL. */
  amount: number | null;
  /** Raw MCC код (для контексту у Claude-prompt-і). */
  mcc: number | null;
  /** ms-timestamp коли item потрапив у буфер — для buffer-age метрик. */
  enqueuedAt: number;
  /** Скільки разів tx уже ретраївся у per-row queue до того, як потрапив сюди. */
  attempts: number;
}

/**
 * Hard cap = `softCap × 10`. softCap — це бажаний batch-size; коли буфер
 * виходить за hard-cap, ми починаємо дропати нові enqueue-и (caller
 * фолбекає у per-row Anthropic). Це захищає від OOM коли batch-tick
 * crashed і черга налазить без drain-у.
 */
const HARD_CAP_MULTIPLIER = 10;

let buffer: UnknownMccItem[] = [];

/**
 * Push item у буфер. Повертає `true` якщо успішно, `false` якщо буфер
 * переповнений (caller має фолбекнути на per-row Anthropic). Side-effect:
 * оновлює gauge `mono_mcc_buffer_depth`.
 */
export function enqueueUnknownMcc(
  item: UnknownMccItem,
  softCap: number,
): boolean {
  const hardCap = softCap * HARD_CAP_MULTIPLIER;
  if (buffer.length >= hardCap) {
    return false;
  }
  buffer.push(item);
  monoMccBufferDepth.set(buffer.length);
  return true;
}

/**
 * Atomically видалити з буфер-у до `maxSize` найстаріших items і повернути
 * їх. Порожній буфер → `[]`. Side-effect: оновлює gauge `mono_mcc_buffer_depth`.
 */
export function drainBatch(maxSize: number): UnknownMccItem[] {
  if (maxSize <= 0 || buffer.length === 0) return [];
  const taken = buffer.splice(0, maxSize);
  monoMccBufferDepth.set(buffer.length);
  return taken;
}

/**
 * Повернути items назад у буфер (LIFO — items уже були найстарішими, тож
 * їх позиція попереду решти зберігається). Викликається з batch-tick-у
 * коли Anthropic відповів частково: ті items, які НЕ потрапили у parsed
 * відповідь, повертаються у буфер до наступного tick-у. Side-effect:
 * оновлює gauge.
 *
 * Item, який ретраїться так > N разів, у caller-і слід redirect-нути у
 * per-row queue (`MARK_RETRY_SQL`), щоб не зациклити infinite-buffer.
 */
export function returnToBuffer(items: UnknownMccItem[]): void {
  if (items.length === 0) return;
  buffer = [...items, ...buffer];
  monoMccBufferDepth.set(buffer.length);
}

/** Поточний розмір буфер-у — для метрик і health-endpoint-у. */
export function currentBufferSize(): number {
  return buffer.length;
}

/**
 * Reset для unit-тестів. НЕ викликати з prod-коду — це знищить items,
 * які ще не записалися у БД, і queue.row залишиться у `processing`
 * назавжди (потребує `MARK_RETRY_SQL` для очищення).
 */
export function __resetForTests(): void {
  buffer = [];
  monoMccBufferDepth.set(0);
}
