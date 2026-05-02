/**
 * Bottom-nav catalogue for Fizruk (React Native).
 *
 * Mirrors `apps/web/src/modules/fizruk/shell/fizrukNav.tsx` — same 4
 * primary entries (`dashboard`, `workouts`, `plan`, `body`).
 *
 * Labels updated per UX plan §5.1:
 *  - "Прогрес" → merged with Measurements under the "body" nav item as
 *    "Моє тіло" (the Body screen already links to Measurements).
 *  - The standalone `progress` tab is removed from the bottom-nav; it
 *    remains accessible via the Body screen's "Заміри" link and via
 *    direct Expo Router push when needed.
 *
 * Icons use Lucide name strings — resolved to <Icon> components by the
 * consumer (e.g. FizrukApp or a FizrukBottomNav component) rather than
 * imported here to keep this file framework-free and easily testable.
 */

import type { FizrukPage } from "./fizrukRoute";

export interface FizrukNavItem {
  id: Extract<FizrukPage, "dashboard" | "workouts" | "plan" | "body">;
  label: string;
  /** Lucide icon name resolved by the rendering component. */
  icon: string;
}

export const FIZRUK_NAV: readonly FizrukNavItem[] = [
  { id: "dashboard", label: "Сьогодні", icon: "clock" },
  { id: "workouts", label: "Тренування", icon: "dumbbell" },
  { id: "plan", label: "План", icon: "calendar-days" },
  { id: "body", label: "Моє тіло", icon: "heart-pulse" },
] as const;
