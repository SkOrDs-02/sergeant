/**
 * Дельта комори для outbox (rel-10, аудит 2026-10-01).
 *
 * `pantry-upsert` несе знімок усього місця, а адаптер раніше ставив у
 * `sync_op_outbox` upsert КОЖНОЇ позиції при кожній зміні: n послідовних
 * додавань давали n(n+1)/2 оп-ів, пер-юзерський ліміт 60/хв вичерпувався вже
 * на ~25 додаваннях. Тут рахується, що саме змінилось між `prev` і `next`,
 * щоб адаптер ставив у outbox лише це.
 *
 * Дельта керує і мережевою чергою, і локальним SQLite-upsert-ом: незмінну
 * позицію не переписуємо локально, бо це бампило б її `updated_at` без пушу, і
 * pull-оп іншого пристрою відсікався б як stale (пристрій розходився б із
 * сервером). Op без дельти (перший знімок, реплей) лишається повним upsert-ом.
 * `prev` - warm-кеш з похідними id, тож дельті не можна довіряти до кінця:
 * адаптер додає до неї позиції, яких у SQLite немає під цим id або значення
 * яких відрізняються (`adapter.pantryReconcile.ts`).
 * Модель id (позиційні) не міняється: це окрема ініціатива data-40.
 */
import type {
  NutritionPantryItemSnapshot,
  NutritionPantrySnapshot,
} from "./diff.js";

export interface PantryDelta {
  /** id позицій `next`, яких немає в `prev` або які відрізняються від неї. */
  readonly changedItemIds: readonly string[];
  /** Змінились `name`/`text` самого місця (рядок `nutrition_pantries`). */
  readonly pantryFieldsChanged: boolean;
}

function itemChanged(
  prev: NutritionPantryItemSnapshot,
  prevIndex: number,
  next: NutritionPantryItemSnapshot,
  nextIndex: number,
): boolean {
  return (
    // `sort_order` іде в тому ж outbox-рядку, що й решта полів: зсув позиції
    // без зміни вмісту теж має доїхати до сервера.
    prevIndex !== nextIndex ||
    prev.name !== next.name ||
    prev.qty !== next.qty ||
    prev.unit !== next.unit ||
    prev.notes !== next.notes ||
    (prev.sources ?? null) !== (next.sources ?? null)
  );
}

export function computePantryDelta(
  prev: NutritionPantrySnapshot,
  next: NutritionPantrySnapshot,
): PantryDelta {
  const prevById = new Map<
    string,
    { item: NutritionPantryItemSnapshot; index: number }
  >();
  prev.items.forEach((item, index) => prevById.set(item.id, { item, index }));

  const changedItemIds: string[] = [];
  next.items.forEach((item, index) => {
    const before = prevById.get(item.id);
    if (!before || itemChanged(before.item, before.index, item, index)) {
      changedItemIds.push(item.id);
    }
  });

  return {
    changedItemIds,
    pantryFieldsChanged: prev.name !== next.name || prev.text !== next.text,
  };
}
