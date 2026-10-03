import { useEffect, useRef } from "react";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  computeNutritionQuickStats,
  todayISODate,
} from "@sergeant/nutrition-domain";
import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";

/**
 * Production writer for the Hub nutrition quick-stats snapshot.
 *
 * The Hub bento card reads `todayCal` / `calGoal` from
 * `STORAGE_KEYS.NUTRITION_QUICK_STATS`, but the only historic writer was the
 * onboarding demo seeder — so a real user's card stayed on the empty-state
 * promise no matter how many meals they logged (test-observations A1).
 *
 * Mounted once at the nutrition module root, this recomputes the snapshot
 * whenever the log or prefs change and writes it back on the device-local
 * day boundary (ADR-0078 — matches the day key `useNutritionLog` writes
 * meals under). A `storageUpdated` bump lets any same-tab Hub consumer
 * re-read immediately.
 */
export function useNutritionQuickStatsWriter({
  log,
  prefs,
}: {
  log: NutritionLog;
  prefs: NutritionPrefs;
}): void {
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    lastWrittenRef.current = writeNutritionQuickStatsSnapshot({ log, prefs });
  }, [log, prefs]);
}

/**
 * Same write, без React-життєвого циклу — щоб знімок можна було відновити
 * поза екраном модуля (див. `useNutritionQuickStatsBoot`).
 *
 * `prefs` навмисно приймає `null`: у теплому SQLite-кеші його немає, доки
 * користувач не задав цілі. Ніякого дефолтного таргета тут не вигадуємо —
 * `computeNutritionQuickStats` поверне `calGoal: 0`, а селектор
 * `selectModulePreview` на нулі просто не рендерить рядок «Ціль: …» і
 * лишає кільце прогресу порожнім. Зʼїдені сьогодні калорії — виміряний
 * факт, тож їх картка показує й без цілі; мовчить саме та частина, що без
 * цілі не має сенсу (пор. F-010 у browser QA 2026-08-04).
 */
export function writeNutritionQuickStatsSnapshot({
  log,
  prefs,
}: {
  log: NutritionLog;
  prefs: NutritionPrefs | null;
}): string {
  const payload = JSON.stringify(
    // ADR-0078: картка показує "зʼїдено сьогодні" за тим самим днем, під
    // яким лог реально зберігає прийоми їжі — днем пристрою.
    computeNutritionQuickStats(log, prefs, todayISODate()),
  );
  if (safeReadStringLS(STORAGE_KEYS.NUTRITION_QUICK_STATS) === payload) {
    return payload;
  }
  if (safeWriteLS(STORAGE_KEYS.NUTRITION_QUICK_STATS, payload)) {
    emitHubBus("storageUpdated", undefined);
  }
  return payload;
}
