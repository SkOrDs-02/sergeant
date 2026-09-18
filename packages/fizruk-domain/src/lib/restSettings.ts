/**
 * Pure helpers для замовчувань часу відпочинку між підходами.
 *
 * React-хук `useRestSettings` (у apps/web), що персистить user overrides
 * у localStorage, імпортує ці сталі — а не навпаки, щоб пакет лишався
 * DOM-free.
 */

/**
 * Стандартний час відпочинку (секунди) за категорією вправи.
 *  - compound: chest/back/legs/glutes/full_body
 *  - isolation: shoulders/arms/core
 *  - cardio: cardio
 */
export const REST_DEFAULTS = {
  compound: 90,
  isolation: 60,
  cardio: 30,
} as const;

export const REST_CATEGORY_LABELS: Record<keyof typeof REST_DEFAULTS, string> =
  {
    compound: "Базові",
    isolation: "Ізоляція",
    cardio: "Кардіо",
  };

const ISOLATION_GROUPS = [
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "calves",
];
const CARDIO_GROUPS = ["cardio"];

export type RestCategory = keyof typeof REST_DEFAULTS;

/** Класифікує `primaryGroup` у compound/isolation/cardio. */
export function getRestCategory(
  primaryGroup: string | null | undefined,
): RestCategory {
  if (!primaryGroup) return "compound";
  if (CARDIO_GROUPS.includes(primaryGroup)) return "cardio";
  if (ISOLATION_GROUPS.includes(primaryGroup)) return "isolation";
  return "compound";
}
