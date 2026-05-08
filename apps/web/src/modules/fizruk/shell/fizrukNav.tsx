import type { ModuleBottomNavItem } from "@shared/components/ui/ModuleBottomNav";
import type { FizrukPage } from "./fizrukRoute";

const NAV_SVG_PROPS = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export interface FizrukNavItem extends ModuleBottomNavItem {
  id: Extract<FizrukPage, "dashboard" | "workouts" | "progress" | "body">;
}

export const FIZRUK_NAV: readonly FizrukNavItem[] = [
  {
    id: "dashboard",
    label: "Огляд",
    icon: (
      <svg {...NAV_SVG_PROPS}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: "workouts",
    label: "Тренування",
    icon: (
      <svg {...NAV_SVG_PROPS}>
        <path d="M6.5 6.5h11M6.5 17.5h11M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" />
      </svg>
    ),
  },
  {
    id: "progress",
    label: "Прогрес і заміри",
    icon: (
      <svg {...NAV_SVG_PROPS}>
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="15 7 21 7 21 13" />
      </svg>
    ),
  },
  {
    id: "body",
    label: "Моє тіло",
    icon: (
      <svg {...NAV_SVG_PROPS}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
] as const;
