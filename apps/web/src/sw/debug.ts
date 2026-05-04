/**
 * SW debug-snapshot helper + debug-flag accessor.
 *
 * Виокремлено з sw.ts (initiative 0001 Phase 2 — module decomposition).
 * Snapshot використовується UI «Дебаг service worker» (page
 * `/debug/sw`), де ми показуємо адміну поточний стан кешів і
 * dedup-set-у. Збираємо все async-у і повертаємо плоский об'єкт, бо
 * postMessage сериалізує тільки structured-clonable.
 */

import { CACHE_NAMES, SW_VERSION } from "./version";
import { cacheEntryCount } from "./cache";
import { getReminderState } from "./reminders";
import { loadNotifiedKeys, notifiedKeys } from "./notifiedKeys";

let debugEnabled = false;

export function getDebugEnabled(): boolean {
  return debugEnabled;
}

export function setDebugEnabled(next: boolean): void {
  debugEnabled = next;
  if (debugEnabled) {
    console.log("[sw] debug enabled", { version: SW_VERSION });
  }
}

export type SwSnapshot =
  | {
      ok: true;
      version: string;
      debugEnabled: boolean;
      caches: { names: string[]; counts: Record<string, number | null> };
      reminders: {
        notifiedKeys: number | null;
        hasRoutine: boolean;
        hasFizruk: boolean;
        hasNutrition: boolean;
      };
    }
  | { ok: false; version: string; error: string };

export async function buildSwSnapshot(): Promise<SwSnapshot> {
  const cacheNames = await caches.keys();
  const workboxCaches = cacheNames.filter((n) => n.startsWith("workbox-"));
  const counts: Record<string, number | null> = {};
  for (const n of [CACHE_NAMES.navigations, CACHE_NAMES.api]) {
    counts[n] = await cacheEntryCount(n);
  }
  for (const n of workboxCaches.slice(0, 5)) {
    // Best-effort: don't scan unbounded.
    if (counts[n] == null) counts[n] = await cacheEntryCount(n);
  }

  let notifiedKeyCount: number | null = null;
  try {
    await loadNotifiedKeys();
    notifiedKeyCount = notifiedKeys.size;
  } catch {
    notifiedKeyCount = null;
  }

  return {
    ok: true,
    version: SW_VERSION,
    debugEnabled,
    caches: { names: cacheNames, counts },
    reminders: { notifiedKeys: notifiedKeyCount, ...getReminderState() },
  };
}
