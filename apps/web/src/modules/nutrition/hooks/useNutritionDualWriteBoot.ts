/**
 * Last validated: 2026-06-15
 * Status: Active
 * React hook that installs the Nutrition dual-write context.
 *
 * Stage 4 PR #032 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Mirror of
 * `useFizrukDualWriteBoot`.
 *
 * Stage 8 PR #056n dropped the `feature.nutrition.sqlite_v2.dual_write`
 * flag — registration is now `userId`-gated only.
 */

import { useEffect } from "react";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { logger } from "@shared/lib";
import { addSentryBreadcrumb } from "../../../core/observability/sentry";

export function useNutritionDualWriteBoot(): void {
  const userId = useLocalUserId();

  useEffect(() => {
    if (!userId) return;
    // AI-CONTEXT: імпорт динамічний, щоб `lib/dualWriteBoot.js`
    // (→ `core/db/sqlite.ts` → `drizzle-orm`) не потрапляв у eager-граф.
    // Статичний імпорт тут тягнув би весь чанк `vendor-sqlite` у
    // критичний шлях — див. `docs/work/specs/tech-debt/frontend.md`.
    let teardown: (() => void) | undefined;
    let cancelled = false;
    void import("../lib/dualWriteBoot.js")
      .then((mod) => {
        if (cancelled) return;
        teardown = mod.bootNutritionDualWrite({ getUserId: () => userId });
      })
      .catch((err: unknown) => {
        // AI-DANGER: без цього `.catch` відхилений імпорт давав би
        // UNHANDLED rejection, а dual-write лишався б вимкненим МОВЧКИ —
        // тобто записи не доходили б до SQLite до перезавантаження, і
        // жоден сигнал про це не зʼявлявся б.
        //
        // Після розмонтування мовчимо навмисно: скасування — не збій.
        if (cancelled) return;
        logger.warn("[nutrition] dual-write boot chunk failed", err);
        addSentryBreadcrumb({
          category: "storage",
          level: "warning",
          message: "nutrition_dual_write_boot_chunk_failed",
        });
      });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [userId]);
}
