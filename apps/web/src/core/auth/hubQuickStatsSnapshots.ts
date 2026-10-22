/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Похідні снапшоти бенто хабу. Плоскі, не привʼязані до користувача, тож їх
 * треба скидати на кожній зміні identity, зокрема й на UI-виході, який
 * наперед штампує власника чату і тому оминає reconcile-ефект.
 * Винесено з `AuthContext` (ліміт 600 рядків, Hard Rule #18).
 */
import { safeRemoveLS } from "@shared/lib/storage/storage";

const HUB_QUICK_STATS_KEYS = [
  "finyk_quick_stats",
  "fizruk_quick_stats",
  "routine_quick_stats",
  "nutrition_quick_stats",
] as const;

export function clearHubQuickStatsSnapshots(): void {
  for (const key of HUB_QUICK_STATS_KEYS) safeRemoveLS(key);
}
