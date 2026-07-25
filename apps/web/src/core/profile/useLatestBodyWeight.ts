/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Хаб-рівневий доступ до «поточної ваги» з fizruk-сховищ.
 *
 * W1-WEIGHT-SOT стадія 1. Канон fizruk §10 каже «fizruk володіє тілом,
 * nutrition читає» — але вага фізично лежить у двох fizruk-таблицях
 * (`fizruk_daily_log` + `fizruk_measurements`), а nutrition історично читав
 * третє місце, `hub_biometrics_v1`. Цей хук дає споживачам поза fizruk-ом
 * (nutrition-TDEE, профіль) один union-зріз, не змушуючи їх знати про
 * внутрішню розкладку модуля.
 *
 * Живе в `core/profile/`, а не в `modules/nutrition/`, щоб не заводити
 * пряму залежність nutrition → fizruk: `core/profile` уже імпортує
 * `useDailyLog` (див. `BiometricsSection.tsx`).
 *
 * НІЧОГО не пише — це чисто читання (стадія 1 additive).
 */
import { useMemo } from "react";
import { selectLatestBodyWeight } from "@sergeant/fizruk-domain";
import { useDailyLog } from "../../modules/fizruk/hooks/useDailyLog";
import { useMeasurements } from "../../modules/fizruk/hooks/useMeasurements";

/**
 * Найсвіжіше зважування з обох fizruk-сховищ, або `null` коли користувач
 * ще не зважувався (типово — юзер без модуля fizruk). Викликачі мають
 * тримати власний фолбек (для nutrition це `biometrics.weightKg`).
 */
export function useLatestBodyWeightKg(): number | null {
  const { entries: dailyLogEntries } = useDailyLog();
  const { entries: measurementEntries } = useMeasurements();
  return useMemo(
    () =>
      selectLatestBodyWeight(dailyLogEntries, measurementEntries)?.weightKg ??
      null,
    [dailyLogEntries, measurementEntries],
  );
}
