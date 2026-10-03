/**
 * Last validated: 2026-09-16
 * Status: Active
 *
 * Очікування «поки in-flight tick завершиться» зі СТЕЛЕЮ часу — спільна
 * деталь усіх наших Tier-A полерів (`silpo/syncScheduler`,
 * `gdpr/cleanupPoller`, `logRetention/archivePoller`,
 * `webhooks/retentionPoller`, `billing/plataSync`).
 *
 * ── Що саме тут лагодиться ──────────────────────────────────────────────
 *
 * У кожному з них `stop()` мав вигляд
 *
 *     while (this.running) { await new Promise(r => setTimeout(r, 20)); }
 *
 * — busy-wait БЕЗ верхньої межі. Поки tick чесно завершується, це працює.
 * Але tick кожного з цих полерів ходить у Postgres, а частина ще й у
 * зовнішні API; варто апстріму зависнути — і `stop()` не повертається
 * ніколи. На shutdown-і це означає, що процес доживає до hard-таймера
 * (а при SIGKILL від Docker — і не доживає), тобто graceful-шлях просто
 * не існує саме в тому випадку, заради якого його писали.
 *
 * Стеля тут — ВЛАСНІСТЬ полера, а не caller-а. Виклик `stop()` з тесту чи
 * з admin-ендпоінта має ту саму гарантію завершення, що й виклик із
 * `index.ts`; покладатись на те, що зовнішній `Promise.race` колись
 * обгорне, не можна — обгорне один caller, а решта зависне.
 *
 * ── Чому лишаємо polling, а не сигнал ───────────────────────────────────
 *
 * Правильніше було б, щоб tick сам резолвив Promise у `finally`. Це
 * потребує стану в кожному полері й переписування п'яти класів; поки що
 * зберігаємо наявну форму (опитування прапорця) і додаємо рівно те, чого
 * бракувало — межу. Крок опитування лишається 20 мс: він уже підібраний і
 * на shutdown-і невідчутний.
 */

/** Крок опитування прапорця. Той самий, що був у скопійованих циклах. */
const POLL_STEP_MS = 20;

/**
 * Стеля за замовчуванням на дренаж одного полера.
 *
 * Дві секунди — компроміс: звичайний tick завершується за десятки
 * мілісекунд, а на зависанні ми віддаємо бюджет наступним фазам shutdown-у
 * (закриття пулу, flush телеметрії) замість того, щоб чекати на апстрім,
 * який уже не відповідає.
 */
export const DEFAULT_POLLER_DRAIN_MS = 2_000;

export interface WaitUntilIdleResult {
  /** `true` — tick завершився сам; `false` — вийшли за стелею часу. */
  idle: boolean;
  /** Скільки реально чекали, мс. Для логів і тестів. */
  waitedMs: number;
}

/**
 * Дочекатись, поки `isBusy()` перестане віддавати `true`, але не довше за
 * `timeoutMs`.
 *
 * Не кидає: вихід за стелею — це штатний, очікуваний результат, про який
 * caller вирішує сам (зазвичай — warn-лог і рух далі). Кидати тут означало б
 * змусити кожен `stop()` обгортатись у try/catch заради нормального випадку.
 */
export async function waitUntilIdle(
  isBusy: () => boolean,
  timeoutMs: number = DEFAULT_POLLER_DRAIN_MS,
): Promise<WaitUntilIdleResult> {
  const startedAt = Date.now();
  // Перевіряємо ПЕРЕД першим очікуванням: найчастіший випадок — полер уже
  // простоює, і платити 20 мс за це не треба.
  while (isBusy()) {
    if (Date.now() - startedAt >= timeoutMs) {
      return { idle: false, waitedMs: Date.now() - startedAt };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_STEP_MS));
  }
  return { idle: true, waitedMs: Date.now() - startedAt };
}
