/**
 * Лічильники осі дня для шапки хаба: «зараз N · закрито M» (мова H).
 *
 * Купи «Зараз» і «Закрито» рахують свої рядки самі, а шапка стоїть вище за
 * деревом, тож числа йдуть через крихітне зовнішнє сховище, а не через
 * пропи на три рівні. `null` - купа зараз не змонтована (інша вкладка,
 * FTUX-hero), і шапка рядок не показує.
 *
 * Last validated: 2026-10-09
 * Status: Active
 */
import { useEffect, useSyncExternalStore } from "react";

export interface HubDayCounts {
  now: number | null;
  closed: number | null;
}

let counts: HubDayCounts = { now: null, closed: null };
const listeners = new Set<() => void>();

function set(key: keyof HubDayCounts, value: number | null) {
  if (counts[key] === value) return;
  counts = { ...counts, [key]: value };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Купа публікує своє число, поки змонтована. */
export function usePublishHubDayCount(key: keyof HubDayCounts, value: number) {
  useEffect(() => {
    set(key, value);
  }, [key, value]);
  useEffect(() => () => set(key, null), [key]);
}

export function useHubDayCounts(): HubDayCounts {
  return useSyncExternalStore(
    subscribe,
    () => counts,
    () => counts,
  );
}
