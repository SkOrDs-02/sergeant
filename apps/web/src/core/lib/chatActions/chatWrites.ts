/**
 * Status: Active
 *
 * Збирач write-підтверджень чат-батча (спільний для routine і finyk).
 *
 * AI-CONTEXT: чат-екзекутори синхронні, а довговічність запису (SQLite)
 * з'ясовується асинхронно. Екзекутор, що пише через міст модуля, реєструє
 * `Promise<boolean>` тут (`trackChatWrite`), а `executeActions` збирає їх
 * навколо `dispatch` (`captureChatWrites`) і зводить у `confirm` результату,
 * який `settle()` дочікується. Без цього дія рапортує «записано» на факті
 * «передав у dual-write» (QA F-12; rel-16 для Фініка).
 *
 * Поза батчем (юніт-тест, undo-замикання) збирача нема, і `trackChatWrite`
 * нічого не робить: undo не має впливати на результат початкової дії.
 */

import type { ChatActionResult } from "./types.result";

/** Стеля очікування підтвердження запису (мс): завислий SQLite не вішає хід. */
export const CHAT_WRITE_CONFIRM_TIMEOUT_MS = 10_000;

/**
 * Активний збирач. `null` означає «викликано поза чат-батчем».
 */
let sink: Array<Promise<boolean>> | null = null;

/** Чи йде зараз збір підтверджень (тобто ми всередині чат-батча). */
export function isCapturingChatWrites(): boolean {
  return sink !== null;
}

/** Зареєструвати підтвердження запису в активному збирачі (якщо він є). */
export function trackChatWrite(write: Promise<boolean>): void {
  if (sink) sink.push(write);
}

/**
 * Виконати `run()` і зібрати всі write-підтвердження, які він породив.
 *
 * `run` синхронний навмисно: dispatch чат-тулів синхронний, тож усе, що
 * потрапило в збирач за час виклику, належить саме цій дії.
 */
export function captureChatWrites<T>(run: () => T): {
  value: T;
  writes: Array<Promise<boolean>>;
} {
  const previousSink = sink;
  const collected: Array<Promise<boolean>> = [];
  sink = collected;
  try {
    return { value: run(), writes: collected };
  } finally {
    sink = previousSink;
  }
}

/**
 * Звести кілька підтверджень в одне: `true`, лише якщо ВСІ записи лягли.
 * Відхилений промис і тайм-аут рахуються як `false` (чесна відмова краща за
 * завислу відповідь моделі).
 */
export function combineChatWrites(
  writes: ReadonlyArray<Promise<boolean>>,
  timeoutMs: number = CHAT_WRITE_CONFIRM_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const all = Promise.all(writes.map((w) => w.catch(() => false))).then(
    (results) => results.every(Boolean),
  );
  return Promise.race([all, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Виконати синхронний екзекутор, який викликається ПОЗА збирачем `executeActions`
 * (async-гілка: після `await` у `create_transaction`), і зафіксувати його
 * write-підтвердження в `confirm` результату. Без цього `trackChatWrite`
 * нічого не бачить (sink === null), а `settle()` не має що чекати (rel-16).
 */
export function withChatWriteConfirm(
  run: () => ChatActionResult,
): ChatActionResult {
  const { value, writes } = captureChatWrites(run);
  if (writes.length === 0) return value;
  const confirm = combineChatWrites(writes);
  return typeof value === "string"
    ? { result: value, confirm }
    : { ...value, confirm };
}
