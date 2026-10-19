/**
 * Дельта комори для outbox (rel-10 + data-40, аудит 2026-10-01).
 *
 * `pantry-upsert` несе знімок усього місця, а адаптер раніше ставив у
 * `sync_op_outbox` upsert КОЖНОЇ позиції при кожній зміні: n послідовних
 * додавань давали n(n+1)/2 оп-ів, пер-юзерський ліміт 60/хв вичерпувався вже
 * на ~25 додаваннях. Тут рахується, що саме змінилось між `prev` і `next`,
 * щоб адаптер ставив у outbox лише це.
 *
 * Дельта керує і мережевою чергою, і локальним SQLite-upsert-ом: незмінну
 * позицію не переписуємо локально, бо це бампило б її `updated_at` без пушу, і
 * pull-оп іншого пристрою з міткою між старим `updated_at` та `clientTs`
 * відсікався б як stale (пристрій розходився б із сервером). Op без дельти
 * (перший знімок, реплей) лишається повним upsert-ом.
 *
 * data-40: id позицій СТАБІЛЬНІ (`PantryItem.id`), тож дельта поелементна:
 *   - `changedItemIds` — нові позиції місця і ті, чий ВМІСТ змінився, або чий
 *     відносний порядок серед спільних позицій змінився. Абсолютний індекс у
 *     «змінилось» НЕ входить: видалення сусідньої позиції зсуває індекси всіх
 *     наступних, але не їхній вміст, і переписувати їх новим `client_ts` значить
 *     перебити паралельну правку іншого пристрою (whole-row LWW). Саме так
 *     офлайн-правка кількості мовчки відкочувалась.
 *   - `removedItemIds` — позиції, що були в `prev` цього місця і зникли зі ВСІХ
 *     місць у `next`. Переїзд в інше місце — це не видалення (id зберігається),
 *     інакше delete і upsert одного id з однаковою міткою перебивали б один
 *     одного на LWW-гарді.
 * `prev` - warm-кеш, тож дельті не можна довіряти до кінця: адаптер додає до
 * неї позиції, яких у SQLite немає під цим id або значення яких відрізняються
 * (`adapter.pantryReconcile.ts`).
 */
import type {
  NutritionPantryItemSnapshot,
  NutritionPantrySnapshot,
} from "./diff.js";

export interface PantryDelta {
  /** id позицій `next`, яких немає в `prev` цього місця або які відрізняються. */
  readonly changedItemIds: readonly string[];
  /** id позицій `prev` цього місця, яких немає в жодному місці `next`. */
  readonly removedItemIds: readonly string[];
  /** Змінились `name`/`text` самого місця (рядок `nutrition_pantries`). */
  readonly pantryFieldsChanged: boolean;
}

function itemChanged(
  prev: NutritionPantryItemSnapshot,
  next: NutritionPantryItemSnapshot,
): boolean {
  return (
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
  /** id усіх позицій `next` у всіх місцях (щоб відрізнити переїзд від видалення). */
  nextItemIdsAnywhere?: ReadonlySet<string>,
): PantryDelta {
  const prevById = new Map<string, NutritionPantryItemSnapshot>();
  for (const item of prev.items) prevById.set(item.id, item);
  const nextById = new Set(next.items.map((item) => item.id));

  // Відносний порядок серед СПІЛЬНИХ позицій: видалення чи вставка поза ними
  // його не міняють, а справжнє перевпорядкування — міняє.
  const prevRank = new Map<string, number>();
  prev.items
    .filter((item) => nextById.has(item.id))
    .forEach((item, rank) => prevRank.set(item.id, rank));
  const nextRank = new Map<string, number>();
  next.items
    .filter((item) => prevById.has(item.id))
    .forEach((item, rank) => nextRank.set(item.id, rank));

  const changedItemIds: string[] = [];
  for (const item of next.items) {
    const before = prevById.get(item.id);
    if (
      !before ||
      itemChanged(before, item) ||
      prevRank.get(item.id) !== nextRank.get(item.id)
    ) {
      changedItemIds.push(item.id);
    }
  }

  const removedItemIds = prev.items
    .map((item) => item.id)
    .filter(
      (id) => !nextById.has(id) && !(nextItemIdsAnywhere?.has(id) ?? false),
    );

  return {
    changedItemIds,
    removedItemIds,
    pantryFieldsChanged: prev.name !== next.name || prev.text !== next.text,
  };
}
