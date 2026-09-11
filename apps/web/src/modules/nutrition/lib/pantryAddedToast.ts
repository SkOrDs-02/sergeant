/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Текст тосту «куди лягло» (рішення власника 2026-09-11): після успішного
 * `upsertItem` людина має бачити, у яке місце комори лягла позиція, а не
 * здогадуватись. Винесено в чисту функцію окремо від `NutritionApp.tsx`
 * (де живе саме підключення до `useToast()`), бо повний `NutritionApp` —
 * важка інтеграційна поверхня, а текст тосту — детермінована логіка без
 * побічних ефектів, яку варто тестувати напряму.
 */

export interface PantryPlaceNameLookup {
  id: string;
  name?: string | null;
}

export interface AddedPantryItem {
  name: string;
  pantryId: string;
}

/** Дефолтна назва, коли місце вже видалене (рідкісна гонка видалення). */
const FALLBACK_PLACE_NAME = "Комора";

export function pantryPlaceName(
  pantries: readonly PantryPlaceNameLookup[],
  id: string,
): string {
  return pantries.find((p) => p.id === id)?.name || FALLBACK_PLACE_NAME;
}

/**
 * Один доданий продукт: «Додано «X» у Y». Кілька — «Додано N позицій у Y»,
 * коли всі лягли в те саме місце, інакше нейтральне «Додано N позицій» без
 * місця (розсипались по різних місцях — одна назва місця тут брехала б).
 * `null`, коли додавати нема чого (порожній список).
 */
export function buildPantryAddedToastMessage(
  items: readonly AddedPantryItem[],
  pantries: readonly PantryPlaceNameLookup[],
): string | null {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const [added] = items;
    if (!added) return null;
    return `Додано «${added.name}» у ${pantryPlaceName(pantries, added.pantryId)}`;
  }

  const firstPlace = items[0]?.pantryId;
  const samePlace = items.every((x) => x.pantryId === firstPlace);
  return samePlace && firstPlace
    ? `Додано ${items.length} позицій у ${pantryPlaceName(pantries, firstPlace)}`
    : `Додано ${items.length} позицій`;
}
