/**
 * Sergeant Finyk — per-day collapse/expand state for `TransactionsPage`.
 *
 * Persisted as a sparse override map; missing entries fall back to the
 * default "only today is expanded" rule. Live-syncs with other MMKV
 * writers (e.g. another screen that flips the same flag) via the MMKV
 * value listener.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { _getMMKVInstance, safeWriteLS } from "@/lib/storage";

import { DAY_COLLAPSE_KEY, type DayCollapseMap } from "../types";
import { dayKeyFromDate, isDayExpanded, readDayCollapse } from "../utils";

export interface UseDayCollapseResult {
  dayOverrides: DayCollapseMap;
  todayDayKey: string;
  toggleDay: (dayKey: string) => void;
}

export function useDayCollapse(now: Date): UseDayCollapseResult {
  const todayDayKey = useMemo(() => dayKeyFromDate(now), [now]);
  const [dayOverrides, setDayOverrides] = useState<DayCollapseMap>(() =>
    readDayCollapse(),
  );

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey === DAY_COLLAPSE_KEY) {
        setDayOverrides(readDayCollapse());
      }
    });
    return () => sub.remove();
  }, []);

  const toggleDay = useCallback(
    (dayKey: string) => {
      setDayOverrides((prev) => {
        const expanded = isDayExpanded(prev, dayKey, todayDayKey);
        const next: DayCollapseMap = { ...prev, [dayKey]: !expanded };
        safeWriteLS(DAY_COLLAPSE_KEY, next);
        return next;
      });
    },
    [todayDayKey],
  );

  return { dayOverrides, todayDayKey, toggleDay };
}
