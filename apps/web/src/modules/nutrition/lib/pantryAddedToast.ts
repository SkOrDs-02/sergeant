/**
 * Last validated: 2026-09-16
 * Status: Active
 *
 * Текст тосту «куди лягло» (рішення власника 2026-09-11): після успішного
 * `upsertItem` людина має бачити, у яке місце комори лягла позиція, а не
 * здогадуватись. Винесено в чисту функцію окремо від `NutritionApp.tsx`
 * (де живе саме підключення до `useToast()`), бо повний `NutritionApp` —
 * важка інтеграційна поверхня, а текст тосту — детермінована логіка без
 * побічних ефектів, яку варто тестувати напряму.
 *
 * Формат — «Місце: додано ...», а не «Додано ... у Місце» (фікс 2026-09-16,
 * знахідка граматичного аудиту хвилі 6). Назва місця — довільний
 * користувацький рядок (комора не обмежує імена), і прийменник «у» вимагав
 * би знахідного відмінка кожного разу: «у комору», «у морозилку», але «у
 * Холодильник» лише випадково збігається з називним. Відмінювати довільний
 * рядок неможливо без словника, тож конструкцію змінено так, щоб відмінок
 * узагалі не був потрібен.
 */

import { pluralUa, type UaPluralForms } from "@sergeant/shared";

/** Знахідний множини: «додано 2 позиції» / «додано 5 позицій». */
const PANTRY_ITEM_FORMS: UaPluralForms = {
  one: "позицію",
  few: "позиції",
  many: "позицій",
};

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
 * Один доданий продукт: «Y: додано «X»». Кілька — «Y: додано N позицій»,
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
    return `${pantryPlaceName(pantries, added.pantryId)}: додано «${added.name}»`;
  }

  const firstPlace = items[0]?.pantryId;
  const samePlace = items.every((x) => x.pantryId === firstPlace);
  const count = `${items.length} ${pluralUa(items.length, PANTRY_ITEM_FORMS)}`;
  return samePlace && firstPlace
    ? `${pantryPlaceName(pantries, firstPlace)}: додано ${count}`
    : `Додано ${count}`;
}
