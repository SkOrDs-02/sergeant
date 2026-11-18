/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Прогрес звʼязків для картки «Що зʼявиться і коли» після першого запису
 * (В-1 → (Б)). Обчислення лінивим `import()` (`newcomerLinkProgress.ts`),
 * перерахунок за тими самими ключами інвалідації, що в
 * `CrossModuleLinksSection`: тіки SQLite-кешів трьох модулів (вони
 * наповнюються після першого рендера), сигнал сховища хаба (Рутина) і
 * день пристрою.
 *
 * `null` — ще не пораховано або вимкнено: картка тоді чекає, щоб не
 * показати «0 з 10» і за мить інше число.
 */
import { useEffect, useState } from "react";
import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";
import { useFinykSqliteReadTick } from "../../modules/finyk/lib/sqliteReadGate";
import { useFizrukSqliteReadTick } from "../../modules/fizruk/lib/sqliteReadGate";
import { useNutritionSqliteReadTick } from "../../modules/nutrition/lib/sqliteReadGate";
import { useHubStorageBump } from "./useHubStorageBump";
import type { NewcomerLinkProgress } from "./newcomerLinkProgress";

export function useNewcomerLinkProgress(
  enabled: boolean,
): NewcomerLinkProgress | null {
  const [progress, setProgress] = useState<NewcomerLinkProgress | null>(null);
  const dayKey = useDeviceDayKey();
  const storageBump = useHubStorageBump();
  const finykTick = useFinykSqliteReadTick();
  const nutritionTick = useNutritionSqliteReadTick();
  const fizrukTick = useFizrukSqliteReadTick();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void import("./newcomerLinkProgress")
      .then((m) => {
        if (!cancelled) setProgress(m.readNewcomerLinkProgress());
      })
      .catch(() => {
        // Чанк не завантажився (офлайн після деплою): картка лишається
        // без прогресу, як до першого запису, а не падає.
        if (!cancelled) setProgress({ sharedDays: 0, linkFound: false });
      });
    return () => {
      cancelled = true;
    };
    // deps — ключі інвалідації (див. `CrossModuleLinksSection`, B1).
  }, [enabled, dayKey, storageBump, finykTick, nutritionTick, fizrukTick]);

  return enabled ? progress : null;
}
