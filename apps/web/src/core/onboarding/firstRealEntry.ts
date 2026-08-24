/**
 * Thin web adapter over `@sergeant/shared/lib/firstRealEntry`. The
 * shared module scans storage for non-demo entries and owns the
 * analytics dispatch contract; this file just wires it to
 * `localStorage` (via the `./vibePicks` adapter), to the canonical
 * per-module counters (`./realEntryProbe`) and to the web analytics sink.
 *
 * AI-DANGER: кожен виклик у shared МУСИТЬ нести `webRealEntryProbe`. Без
 * нього детекція бачить лише tombstone-нуті LS-ключі, `hasRealEntry`
 * не флипається ніколи — і FTUX-герой висить у активного юзера вічно
 * (розбір — у докблоці `./realEntryProbe`).
 */

import {
  countRealEntries as sharedCountRealEntries,
  detectFirstActionCompletedPerModule as sharedDetectFirstActionCompletedPerModule,
  detectFirstRealEntry as sharedDetectFirstRealEntry,
  getFirstRealEntryModule as sharedGetFirstRealEntryModule,
  hasAnyRealEntry as sharedHasAnyRealEntry,
  moduleHasRealEntry as sharedModuleHasRealEntry,
  type DashboardModuleId,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { trackEvent } from "../observability/analytics";
import { webRealEntryProbe } from "./realEntryProbe";

/**
 * Returns true if the user has at least one non-demo entry anywhere.
 * Called on every dashboard render; O(modules) and cheap (no reserialize).
 *
 * Exported for the hub shell: «Звіти» tab is hidden until this becomes
 * true — an empty reports view is worse than no tab at all.
 */
export function hasAnyRealEntry(): boolean {
  return sharedHasAnyRealEntry(webKVStore, webRealEntryProbe);
}

/**
 * Чи має КОНКРЕТНИЙ модуль бодай один не-демо запис (будь-коли, не
 * «сьогодні»). Потрібно бенто-плитці, щоб відрізнити справжній FTUX
 * («записів не було ніколи») від затишшя («історія є, але за поточний
 * період нуль») — інакше людина з місяцем логів бачить «Почни тут →».
 *
 * Той самий доказовий контур, що й `hasAnyRealEntry`: канонічний
 * SQLite-лічильник модуля (якщо його boot-кластер уже зареєструвався)
 * АБО legacy-LS-слот. Незареєстрований модуль дає `false` — це «немає
 * доказу», тож плитка деградує до FTUX, а не вигадує історію.
 */
export function moduleHasRealEntry(moduleId: DashboardModuleId): boolean {
  return sharedModuleHasRealEntry(webKVStore, moduleId, webRealEntryProbe);
}

/**
 * Total non-demo entries across all modules — the «У тебе N записів»
 * number on `SoftAuthPromptCard` and the hub streak card.
 */
export function countRealEntries(): number {
  return sharedCountRealEntries(webKVStore, webRealEntryProbe);
}

/**
 * Call on every render of the dashboard. If the user has a real entry
 * and we haven't fired yet, fire `first_real_entry` and persist the
 * flag so this becomes a no-op for all future renders.
 */
export function detectFirstRealEntry(): boolean {
  return sharedDetectFirstRealEntry(webKVStore, {
    trackEvent,
    probe: webRealEntryProbe,
  });
}

/**
 * PR-08 — call on every render of the dashboard alongside
 * `detectFirstRealEntry`. Fires `first_action_completed { module }`
 * exactly once per module that just got its first non-demo entry.
 *
 * Returns the modules whose flag flipped during this call (rare —
 * usually empty after the first activation in each module).
 */
export function detectFirstActionCompletedPerModule(): DashboardModuleId[] {
  return sharedDetectFirstActionCompletedPerModule(webKVStore, {
    trackEvent,
    probe: webRealEntryProbe,
  });
}

/**
 * Which module owns the user's first real entry? Used by
 * `useFirstEntryCelebration` to pick module-aware copy from
 * `FIRST_ENTRY_CELEBRATIONS`. Returns `null` when no real entry
 * exists yet, or in the rare race where a payload races the read.
 */
export function getFirstRealEntryModule(): DashboardModuleId | null {
  return sharedGetFirstRealEntryModule(webKVStore, webRealEntryProbe);
}
