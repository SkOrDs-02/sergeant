import type { AppliedStatus } from "../syncV2-types.js";
import { isWithinTextBound } from "../syncV2-core.js";

/**
 * Лічильник і автовідмітка звички (міграція 170, Р-1 (а) і (в), рішення
 * founder-а 2026-11-18). Три колонки `routine_habits`: `count_target`,
 * `count_unit`, `auto_mark_source`.
 *
 * AI-DANGER: ВІДСУТНІЙ ключ означає «не чіпати колонку», а не «скинути в
 * NULL». Фронт викочується раніше за бекенд, тож у вікні деплою і після
 * нього лишаються клієнти, що не знають цих полів (старий кеш PWA). Їхній
 * `routine_habits`-оп при перейменуванні звички не несе `count_target`, і
 * трактування «немає = NULL» мовчки стирало б ціль лічильника, яку людина
 * задала на іншому пристрої. Новий клієнт шле ключ завжди (`null`, коли
 * лічильника чи автовідмітки немає), тож явне зняття проходить.
 *
 * Невалідне значення відхиляється з причиною ДО запису, як розклад
 * (`readHabitScheduleFields`): `rejected` клієнт не ретраїть.
 */

/** Закритий список джерел автовідмітки (CHECK у міграції 170). */
export const AUTO_MARK_SOURCES = [
  "fizruk_workout",
  "nutrition_water_goal",
  "finyk_expense",
] as const;

/** Значення колонки, або `undefined` — ключа в рядку немає, колонку не чіпаємо. */
export interface HabitCounterFields {
  countTarget: number | null | undefined;
  countUnit: string | null | undefined;
  autoMarkSource: string | null | undefined;
}

export function readHabitCounterFields(
  row: Record<string, unknown>,
): HabitCounterFields | { reject: AppliedStatus } {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(row, key);

  let countTarget: number | null | undefined;
  if (has("count_target")) {
    const v = row["count_target"];
    if (v === null) countTarget = null;
    else if (typeof v === "number" && Number.isInteger(v) && v >= 1) {
      countTarget = v;
    } else {
      return {
        reject: { status: "rejected", reason: "invalid_count_target" },
      };
    }
  }

  let countUnit: string | null | undefined;
  if (has("count_unit")) {
    const v = row["count_unit"];
    if (v === null) countUnit = null;
    else if (typeof v === "string") {
      // Той самий ліміт, що в назв (`NAME_MAX_LEN` у `isWithinTextBound`).
      if (!isWithinTextBound(v)) {
        return { reject: { status: "rejected", reason: "text_too_long" } };
      }
      countUnit = v;
    } else {
      return { reject: { status: "rejected", reason: "invalid_count_unit" } };
    }
  }

  let autoMarkSource: string | null | undefined;
  if (has("auto_mark_source")) {
    const v = row["auto_mark_source"];
    if (v === null) autoMarkSource = null;
    else if (
      typeof v === "string" &&
      (AUTO_MARK_SOURCES as readonly string[]).includes(v)
    ) {
      autoMarkSource = v;
    } else {
      return {
        reject: { status: "rejected", reason: "invalid_auto_mark_source" },
      };
    }
  }

  return { countTarget, countUnit, autoMarkSource };
}
