/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * Чат-дія «оновити Монобанк за період».
 *
 * **Тут був цикл чищення кешу, і він нічого не чистив.** Він знімав ключі
 * виду `finyk_tx_cache_<рік>_<місяць0>`, але такої форми ключа не пише
 * НІХТО: єдиним її автором у репо був тест, який сам їх і засівав, щоб
 * перевірити, що цикл їх зніме. Базовий `finyk_tx_cache` до того ж
 * tombstone-нутий — читання давно живуть у дзеркалі Моно
 * (`monoMirrorReader`). При цьому відповідь людині стверджувала «Очищено
 * кеш за N міс.», тобто повідомляла про роботу, якої не було. Знахідка
 * PR-T7, аудит 2026-09-13.
 *
 * Справжня робота цієї дії — подія `hub:finyk-mono-import-range`; саме її
 * слухає Фінік і робить імпорт.
 *
 * **Побічно це знімає сім warning-ів `prefer-kyiv-time`.** Аудит пропонував
 * перевести їх на `getKyivDateParts`, і це було б помилкою: рядок
 * `YYYY-MM-DD` парсився в локальну дату й локальними ж геттерами читався
 * назад, тобто пояс скорочувався. Київські частини того самого моменту дали
 * б інший місяць на краю доби — тобто «виправлення» внесло б баг там, де
 * його не було.
 */
import type { ImportMonobankRangeAction, ChatActionResult } from "../types";

export function importMonobankRange(
  action: ImportMonobankRangeAction,
): ChatActionResult {
  const { from, to } = action.input;
  const fromStr = String(from || "").trim();
  const toStr = String(to || "").trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(fromStr) || !dateRe.test(toStr))
    return "Дати мають бути у форматі YYYY-MM-DD.";
  const fromD = new Date(`${fromStr}T00:00:00`);
  const toD = new Date(`${toStr}T00:00:00`);
  if (
    !Number.isFinite(fromD.getTime()) ||
    !Number.isFinite(toD.getTime()) ||
    fromD > toD
  ) {
    return "Некоректний діапазон дат.";
  }
  try {
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("hub:finyk-mono-import-range", {
          detail: { from: fromStr, to: toStr },
        }),
      );
    }
  } catch {}
  return `Запит на оновлення Монобанку з ${fromStr} до ${toStr} прийнято. Оновиться при відкритті Фініка.`;
}
