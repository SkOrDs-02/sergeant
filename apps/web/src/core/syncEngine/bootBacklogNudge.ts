import type { SyncEngineWriterRuntime } from "./syncEngineWriter";

/** Коли після старту writer-а перевіряти, чи черга вже не порожня. */
export const BOOT_BACKLOG_CHECK_DELAYS_MS: readonly number[] = [1_500, 5_000];

/**
 * Штовхає push, якщо на старті writer-а в черзі вже лежать рядки.
 *
 * Рядки, що лягли в чергу ДО реєстрації нуджа (залишок попередньої сесії,
 * запис перед перезавантаженням), нуджа не отримали, а перший періодичний
 * тік настає лише через інтервал: запис, після якого сторінку одразу
 * перезавантажили, їхав на сервер ~30 с, а серія перезавантажень відкладала
 * його далі (`FULL-20261125-DATA-3`).
 *
 * Штовхаємо лише непорожню чергу: порожній старт не має коштувати запиту
 * сесії. Дві спроби, бо рантайм стартує до `AuthContext`: перша ще може
 * читати анонімну партицію, де черги користувача немає.
 */
export function scheduleBootBacklogNudge(
  created: SyncEngineWriterRuntime,
  isCurrent: () => boolean,
): void {
  for (const delayMs of BOOT_BACKLOG_CHECK_DELAYS_MS) {
    setTimeout(() => {
      if (!isCurrent()) return;
      void Promise.resolve()
        .then(() => created.getStatus())
        .then((counts) => {
          if ((counts?.pending ?? 0) > 0) created.notifyEnqueued();
        })
        .catch(() => {
          /* оптимізація латентності: періодичний тік забере чергу сам */
        });
    }, delayMs);
  }
}
