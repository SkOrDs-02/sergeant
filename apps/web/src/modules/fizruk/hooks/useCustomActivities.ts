/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Свої заняття для короткого запису - те саме, що свої вправи, тільки для
 * другого входу в журнал.
 *
 * Персист іде через SQLite-dual-write (`fizruk_custom_activities`,
 * міграція 132), тобто список їде за людиною на інший пристрій. Це важливо
 * саме тут: заняття заводять один раз і використовують місяцями, а
 * per-device список означав би, що на телефоні його доведеться заводити
 * заново - і два записи того самого заняття розійшлись би в MET.
 */
import { useCallback, useMemo } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import { FizrukData } from "@sergeant/fizruk-domain";
import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractCustomActivitySnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

type ActivityDef = FizrukData.ActivityDef;

export interface UseCustomActivitiesResult {
  /** Вбудований каталог плюс свої заняття, свої перекривають за id. */
  activities: ActivityDef[];
  /** Тільки свої - для екрана редагування, якщо колись зʼявиться. */
  customActivities: ActivityDef[];
  /** Додати або перезаписати своє заняття. Повертає збережений запис. */
  addActivity: (activity: ActivityDef) => ActivityDef;
  removeActivity: (id: string) => boolean;
}

export function useCustomActivities(): UseCustomActivitiesResult {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [customActivities, setCustomActivities] = useSqliteTickOverlay<
    ActivityDef[]
  >(
    sqliteCacheTick,
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null ? undefined : cache.customActivities;
    },
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null ? [] : cache.customActivities;
    },
  );

  const persist = useCallback(
    (next: ActivityDef[]) => {
      setCustomActivities(next);
      const prevDualWrite =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      const nextDualWrite = {
        ...prevDualWrite,
        customActivities: extractCustomActivitySnapshots(next),
      };
      try {
        triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
      } catch {
        /* trigger is fire-and-forget - never propagate */
      }
    },
    [setCustomActivities],
  );

  const addActivity = useCallback(
    (activity: ActivityDef) => {
      persist([
        ...customActivities.filter((a) => a.id !== activity.id),
        activity,
      ]);
      return activity;
    },
    [customActivities, persist],
  );

  const removeActivity = useCallback(
    (id: string) => {
      if (!customActivities.some((a) => a.id === id)) return false;
      persist(customActivities.filter((a) => a.id !== id));
      return true;
    },
    [customActivities, persist],
  );

  const activities = useMemo(
    () => FizrukData.mergeActivityCatalog(customActivities),
    [customActivities],
  );

  return { activities, customActivities, addActivity, removeActivity };
}
