/**
 * Стабільні id позицій комори (data-40, ADR-0077 § 3.2, поправка 2026-10-10).
 *
 * До цієї зміни id позиції виводився з її МІСЦЯ в масиві
 * (`<pantryId>::<index>::<name>`): видалення сусідньої позиції зсувало id усіх
 * наступних, а паралельна правка з іншого пристрою програвала LWW і мовчки
 * відкочувалась. Тепер id призначається ОДИН РАЗ при появі позиції в списку
 * (`newPantryItemId`), живе в `PantryItem.id` і не залежить ні від порядку, ні
 * від назви, ні від місця зберігання.
 *
 * AI-CONTEXT: міграції даних немає і не потрібна. Рядки
 * `nutrition_pantry_items` у SQLite і на сервері вже ніс(ли) позиційні id
 * (`home::2::молоко`); рідер тепер віддає `row.id` як `PantryItem.id`, тож
 * наявні позиції СТАЮТЬ стабільними з тим id, який у них уже є. Різні пристрої
 * і версії клієнта дійдуть до одного й того ж id, бо він зафіксований в
 * синхронізованих даних, а не обчислюється заново. Позиція БЕЗ id (старий
 * кеш, імпорт старого бекапу, демо-сід) отримує той самий легасі-id за
 * позицією — детермінований, тож повторний імпорт оновлює рядок, а не плодить
 * дубль.
 *
 * AI-DANGER: клієнт БЕЗ цієї моделі (стара вкладка PWA, вже зібраний mobile)
 * перейменовує `pi_…` на позиційний id і ставить tombstone; нова правка того ж
 * `pi_…` воскрешає рядок, і виходить дубль, що сам не загоюється (ADR-0077 § 3.2).
 * Тому і web, і mobile мусять брати id лише через `resolvePantryItemIds`.
 *
 * AI-DANGER: не повертай `index` у id нових позицій. Саме він зсував усе
 * після видаленої позиції.
 */

/** Мінімальна форма позиції, потрібна для вибору id. */
export interface PantryItemIdLike {
  readonly id?: string | null;
  readonly name?: string | null;
}

/** Префікс id, створених цією моделлю (відрізняє від легасі `…::<idx>::…`). */
const NEW_ID_PREFIX = "pi_";

/**
 * Новий випадковий id позиції. `crypto.randomUUID` є у браузері й Node ≥ 19;
 * фолбек лишається для середовищ без нього (старий WebView, тести без
 * polyfill), де достатньо часу + випадкового хвоста.
 */
export function newPantryItemId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return `${NEW_ID_PREFIX}${c.randomUUID()}`;
  }
  const rnd = Math.random().toString(36).slice(2, 12);
  return `${NEW_ID_PREFIX}${Date.now().toString(36)}_${rnd}`;
}

/**
 * Легасі-id за позицією. Використовується ЛИШЕ для позицій, які ще не мають
 * власного id (див. AI-CONTEXT угорі).
 */
export function legacyPositionalPantryItemId(
  pantryId: string,
  index: number,
  name: string | null | undefined,
): string {
  return `${pantryId}::${index}::${name ?? ""}`;
}

function cleanId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const t = id.trim();
  return t ? t : null;
}

/**
 * Id позицій одного місця, вирівняні за порядком `items`.
 *
 * Явний `id` зберігається. Позиція без id (або з id, що вже зайнятий —
 * дубль у даних) отримує легасі-id за позицією; якщо і той зайнятий,
 * додається суфікс `#2`, `#3`, … Тож результат ЗАВЖДИ унікальний, і два
 * `upsert` з одним id в одному знімку неможливі.
 *
 * @param taken id, уже зайняті іншими місцями цього ж знімка (PK рядка —
 *   `(user_id, id)`, тож id мусить бути унікальним у межах користувача, а не
 *   місця). Функція доповнює цю множину.
 */
export function resolvePantryItemIds(
  pantryId: string,
  items: readonly PantryItemIdLike[],
  taken: Set<string> = new Set(),
): string[] {
  const out: (string | null)[] = items.map(() => null);

  // Прохід 1: явні id мають пріоритет над згенерованими для безідових, інакше
  // легасі-id безідової позиції міг би «вкрасти» id, що належить сусідній.
  items.forEach((it, i) => {
    const explicit = cleanId(it?.id);
    if (explicit && !taken.has(explicit)) {
      taken.add(explicit);
      out[i] = explicit;
    }
  });

  // Прохід 2: решті — легасі-id за позицією з гарантією унікальності.
  items.forEach((it, i) => {
    if (out[i] !== null) return;
    const base = legacyPositionalPantryItemId(pantryId, i, it?.name);
    let candidate = base;
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}#${n}`;
    taken.add(candidate);
    out[i] = candidate;
  });

  return out as string[];
}
