import type { ReactNode } from "react";

export const NAV_ICONS: Record<string, ReactNode> = {
  overview: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  transactions: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  ),
  budgets: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  assets: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  analytics: (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

export interface FinykNavItem {
  id: string;
  label: string;
  /** Див. `ModuleBottomNavItem.visibleLabel` — коротшає лише видимий підпис. */
  visibleLabel?: string;
}

/**
 * Фінік — найширший навбар у продукті (5 табів), тож саме тут підпис
 * упирається в колонку. Числа нижче зняті РЕНДЕРОМ (Chromium, Pixel 5,
 * `nav-label-fit.spec.ts` із тимчасово відʼємним порогом), а не виведені з
 * формули: перша спроба порахувати доступну ширину як
 * `(W − 8 − 4×(N−1)) / N − 8` дала правильний порядок, але вона мовчить про
 * те, що неактивна пілюля кладе іконку й підпис в ОДИН рядок.
 *
 *   підпис          320px: своя / доступна    393px: своя / доступна
 *   Огляд                  34 / 34  ✓                36 / 36  ✓
 *   Операції               49 / 49  ✓                52 / 52  ✓
 *   Планування             68 / 50  ✕                72 / 63  ✕
 *   Аналітика              56 / 50  ✕                60 / 60  ✓
 *   Активи                 39 / 39  ✓                42 / 42  ✓
 *
 * «Планування» різало на ОБОХ ширинах, включно з 393px — тією, яку свіпить
 * блокуючий `Mobile UI audit`. Той гейт цього не бачив, бо міряє
 * touch-targets і бічний скрол, а `text-ellipsis` ховає обрізку за трьома
 * крапками, не переповнюючи viewport (знахідка R1, 2026-09-13).
 *
 * Сам аудит указував не туди — на «Налаштування» в хабі. Воно вже закрите
 * через `visibleLabel: "Опції"`, тобто рахувалась довжина підпису, який
 * ніколи не рендериться.
 *
 * Рішення власника 2026-09-13: скоротити ВИДИМУ копію, доступну назву
 * лишити повною. Гейт на обрізку — `apps/web/tests/mobile/nav-label-fit.spec.ts`.
 */
export const NAV_ITEMS: FinykNavItem[] = [
  { id: "overview", label: "Огляд" },
  { id: "transactions", label: "Операції" },
  { id: "budgets", label: "Планування", visibleLabel: "План" },
  { id: "analytics", label: "Аналітика", visibleLabel: "Аналіз" },
  { id: "assets", label: "Активи" },
];

export const NAV_IDS = NAV_ITEMS.map((n) => n.id);
