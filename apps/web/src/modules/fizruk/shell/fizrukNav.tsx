/**
 * Last validated: 2026-06-05
 * Status: Active
 */
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

/**
 * Fizruk chrome audit V-7: not every `FizrukPage` owns a tab of its own
 * — «Заміри» is a full page, but it lives under the «Прогрес»
 * tab rather than getting a fifth icon in the strip, and the two
 * detail-style routes («Атлас», «Вправа») don't own a tab either. Before
 * this map existed `FizrukApp` passed the raw `page` straight through as
 * `activeId`, so on any of those routes the nav rendered with **no**
 * active state at all (nothing in `FIZRUK_NAV` has `id: "measurements"`,
 * `"atlas"`, …). This resolves any `FizrukPage` to the tab that should
 * read as active, mirroring the same "which section owns this route"
 * judgement `FizrukApp.contextualBackTarget` already makes for the back
 * arrow — kept as an explicit switch (not a lookup record) so a new
 * `FizrukPage` fails to compile here until it's given a home tab.
 */
export function fizrukNavActiveId(page: FizrukPage): FizrukNavItem["id"] {
  switch (page) {
    case "dashboard":
      return "dashboard";
    case "workouts":
    case "workout":
    case "programs":
    case "history":
    case "exercise":
    case "catalog":
    case "templates":
      return "workouts";
    case "progress":
    case "measurements":
      return "progress";
    case "body":
    case "atlas":
      return "body";
  }
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
    // «Прогрес і заміри» (16 символів) не влазив у стелю підпису активної
    // вкладки — `ModuleBottomNav` тримає її на `max-w-[88px]`, і хвіст
    // зрізало посеред слова: «Прогрес і замір» (знахідка QA-аудиту
    // 2026-08-04 «кліп лейбла без ellipsis», скарга власника 2026-08-08).
    // Підпис нижньої навігації — це одне слово, а не назва розділу:
    // сторінка має власний H1 «Прогрес», а вхід у заміри — перша картка
    // на ній («Заміри тіла · Обхвати й динаміка»), тож маршрут
    // `measurements` лишається під цією вкладкою (див. `fizrukNavActiveId`)
    // без згадки в самому підписі.
    label: "Прогрес",
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

/**
 * Порядок вкладок для горизонтального свайпу (`SwipePages`) — той самий, що
 * й у нижній навігації, тож жест і смужка табів рухаються в один бік.
 */
export const SWIPE_PAGE_IDS: readonly FizrukNavItem["id"][] = FIZRUK_NAV.map(
  (item) => item.id,
);
