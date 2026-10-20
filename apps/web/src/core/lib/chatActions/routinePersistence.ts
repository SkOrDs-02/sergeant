/**
 * Status: Active
 *
 * Durable-персистенція для routine-write-tool-ів HubChat.
 *
 * AI-CONTEXT: `saveRoutineState()` повертає `true`, щойно dual-write
 * ВІДПРАВЛЕНО, а `triggerRoutineDualWrite()` мовчки виходить, коли контекст
 * dual-write ще не зареєстровано (boot-кластер модуля вантажиться через
 * `React.lazy`, тож після першого пейнту існує вікно, де контексту нема).
 * Для UI-кнопки це прийнятно: людина бачить власну дію і повторить її. Для
 * чат-тула — ні: він одразу рапортує моделі «відмічено», модель переказує це
 * користувачу, і фраза лишається єдиним доказом дії, якої не сталося
 * (браузерний QA 2026-08-24, знахідка F-12).
 *
 * Тому write-тули ходять сюди: тепла кеш-копія оновлюється синхронно (UI не
 * чекає), а `Promise<boolean>` каже, чи ops справді лягли в SQLite. Ту саму
 * різницю «передано ≠ збережено» вже описує `saveRoutineStateDurable()` для
 * FTUX-плитки — тут той самий контракт для tool-шляху.
 */
import {
  captureChatWrites,
  isCapturingChatWrites,
  trackChatWrite,
} from "./chatWrites";
import { isDualWriteOutcomeClean } from "../../durability/dualWriteJournal.js";
import {
  loadRoutineState,
  saveRoutineStateDurable,
} from "../../../modules/routine/lib/routineStorage";
import {
  dualWriteRoutineState,
  isRoutineDualWriteRegistered,
} from "../../../modules/routine/lib/sqliteWriter";
import type { RoutineState } from "../../../modules/routine/lib/types";

/**
 * Записати стан рутини і повернути ПІДТВЕРДЖЕННЯ довговічності.
 *
 * Тепла кеш-копія оновлюється синхронно (усередині
 * `saveRoutineStateDurable`), тож наступний `loadRoutineState()` у тому ж
 * такті вже бачить зміну. Промис резолвиться `true`, лише коли ops реально
 * застосовані до SQLite.
 *
 * Якщо перша спроба повернула `skipped`, а контекст тим часом зареєструвався,
 * повторюємо dual-write із ЗБЕРЕЖЕНИМ `prev`-знімком. Повтор через
 * `saveRoutineStateDurable` тут не працює: тепла копія вже дорівнює `next`,
 * тож diff був би порожній.
 */
export function persistRoutineState(next: RoutineState): Promise<boolean> {
  const prev = loadRoutineState();
  const inBatch = isCapturingChatWrites();
  const settled = saveRoutineStateDurable(next).then(async (applied) => {
    if (applied || !inBatch) return applied;
    // Контекст міг зареєструватись, поки відпрацьовувала перша спроба
    // (boot-кластер вантажиться паралельно). Один повтор без таймерів:
    // чекати довше — означало б тримати відповідь моделі на паузі.
    if (!isRoutineDualWriteRegistered()) return false;
    const outcome = await dualWriteRoutineState(prev, next);
    return isDualWriteOutcomeClean(outcome);
  });
  trackChatWrite(settled);
  return settled;
}

/**
 * Збирач спільний з Фініком (`chatWrites.ts`); стара назва лишається для
 * наявних викликачів і тестів.
 */
export const captureRoutineWrites = captureChatWrites;
