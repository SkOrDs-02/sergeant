import { useState, type Dispatch, type SetStateAction } from "react";
import {
  mergeItemsIntoPlaces,
  updatePantry,
  type Pantry,
  type PlacedPantryItem,
} from "@sergeant/nutrition-domain";
import { appendNutritionPantryEvent } from "../lib/nutritionStorage";
import {
  canonicalFoodKey,
  displayFoodName,
  matchFoodName,
  normalizeUnit,
  parseLoosePantryText,
  type PantryItem,
} from "../lib/pantryTextParser";
import {
  getRememberedAmbiguousUnit,
  rememberAmbiguousUnitChoice,
  type AmbiguousPantryUnit,
} from "../lib/pantryAmbiguousUnitMemory";
import type { PantryItemsAddedEntry } from "./useNutritionPantries";

/**
 * Винесено з `useNutritionPantries.ts` (Hard Rule #18, max-lines 600) -
 * увесь шлях запису поповнення: ручний (`upsertItem`), автоімпорт Сільпо
 * (`upsertItemForAutoImport`), відкат автоімпорту (`revertReplenish`,
 * спека `docs/work/specs/silpo-pantry-auto-import.md` § «Механіка
 * відкату») і підказка «шт чи г?» (UX-4). Отримує лише те, від чого
 * реально залежить: поточні позиції (для `existsBefore`), куди класти
 * (`placeOf`) і сирий `setPantries` - решта `useNutritionPantries` про цю
 * логіку більше нічого не знає.
 */

/**
 * Лінія одного поповнення - «ключ позиції комори + додана кількість»
 * (спека § «Механіка відкату»). `isNewPosition` - позицію СТВОРИВ саме цей
 * запис (у коморі її не було до нього): «Повернути» видаляє таку позицію
 * повністю, коли відкат приводить її до нуля, а не лишає порожній рядок.
 */
export interface PantryReplenishLine {
  pantryId: string;
  itemName: string;
  addedQty: number;
  unit: string | null;
  isNewPosition: boolean;
}

export interface UsePantryReplenishWriteParams {
  pantryItems: readonly PlacedPantryItem[];
  placeOf: (name: unknown) => string;
  setPantries: Dispatch<SetStateAction<Pantry[]>>;
  onItemsAdded?: ((items: PantryItemsAddedEntry[]) => void) | undefined;
}

/**
 * Єдина нормалізація для всіх шляхів наповнення комори: ручний ввід,
 * сканер, відповідь AI. Раніше AI-шлях клав `items` у стан як є, тому
 * модель, що повернула «гр» замість «г», плодила окрему позицію поруч
 * із уже наявною.
 *
 * `name` проходить через `displayFoodName`, а не через match-нормалізацію:
 * зі сканера сюди приходять бренди («Coca-Cola Zero», «Яготинське»), і
 * зіставлення все одно робиться окремим ключем.
 */
export function normalizeIncomingItems(
  raw: PantryItem | PantryItem[],
): PantryItem[] {
  return (Array.isArray(raw) ? raw : [raw])
    .map((item) => ({
      name: displayFoodName(item?.name),
      qty:
        item?.qty == null || !Number.isFinite(Number(item.qty))
          ? null
          : Number(item.qty),
      unit: item?.unit != null ? normalizeUnit(item.unit) : null,
      notes: item?.notes ?? null,
      sources: Array.isArray(item?.sources) ? item.sources : null,
    }))
    .filter((item) => item.name);
}

/**
 * Якщо цей продукт уже отримував явний вибір «шт чи г?» (UX-4), застосовує
 * його мовчки і знімає `ambiguousQty` - саме тому вдруге не питаємо про той
 * самий товар. Продукт, про який ще не питали, повертається без змін: тоді
 * прапорець доходить до UI і викликає підказку.
 */
function resolveAmbiguousItemWithMemory(item: PantryItem): PantryItem {
  if (!item.ambiguousQty) return item;
  const remembered = getRememberedAmbiguousUnit(canonicalFoodKey(item.name));
  if (!remembered) return item;
  const { ambiguousQty: _drop, ...rest } = item;
  void _drop;
  return { ...rest, unit: remembered };
}

export function usePantryReplenishWrite({
  pantryItems,
  placeOf,
  setPantries,
  onItemsAdded,
}: UsePantryReplenishWriteParams) {
  // UX-4 (аудит 2026-09-01) - позиції з `upsertItem`, чиє хвостове число без
  // одиниці лишилось неоднозначним ПІСЛЯ перевірки памʼяті (нижче). Не
  // мерджаться в комору, доки людина не тапне «шт» чи «г» - один тап у
  // тому самому потоці, без модалки (`PantryAmbiguousQtyPrompt`).
  const [ambiguousPantryItems, setAmbiguousPantryItems] = useState<
    PantryItem[]
  >([]);

  // Витягнуто з колишнього тіла `upsertItem`: злиття по місцях + одна
  // 'replenish'-подія на позицію з відомою кількістю. Використовується і
  // прямим шляхом (немає неоднозначних чисел), і з дозволу підказки
  // «шт чи г?» нижче - обидва мають записати рівно те саме.
  const mergeParsedItems = (items: PantryItem[]): PantryReplenishLine[] => {
    if (!items.length) return [];
    // Місце фіксується ДО `setPantries`: і подія, і колбек нижче мають
    // читати те саме місце, яке щойно вирішило злиття, а не перерахунок
    // над уже зміненим станом. `existsBefore` - теж ДО злиття: після
    // `setPantries` кожна позиція вже «існує», і відкат (`revertReplenish`)
    // не зміг би відрізнити щойно створену від давньої.
    const placements: PantryItemsAddedEntry[] = items.map((item) => ({
      name: item.name,
      pantryId: placeOf(item.name),
    }));
    // Окремо від `placements` - той спливає в публічний `onItemsAdded`
    // (лише `{name, pantryId}`, не наш внутрішній деталь запису).
    const existsBefore = items.map((item) =>
      pantryItems.some(
        (x) => matchFoodName(x.name) === matchFoodName(item.name),
      ),
    );
    setPantries((cur) => mergeItemsIntoPlaces(cur, items, placeOf));
    // W1-PANTRY-APPEND стадія 2 - паралельно до запису `qty` вище: одна
    // 'replenish'-подія на кожну позицію з відомою кількістю. Позиції без
    // qty (гола назва - «сіль») дельту не несуть, тож пропускаємо.
    const lines: PantryReplenishLine[] = [];
    items.forEach((item, i) => {
      if (item.qty == null || !Number.isFinite(item.qty)) return;
      const pantryId = placements[i]?.pantryId ?? placeOf(item.name);
      appendNutritionPantryEvent({
        id: null,
        pantryId,
        itemId: null,
        itemKey: canonicalFoodKey(item.name),
        kind: "replenish",
        deltaQty: item.qty,
        absQty: null,
        unit: item.unit,
        source: "manual",
        mealId: null,
      });
      lines.push({
        pantryId,
        itemName: item.name,
        addedQty: item.qty,
        unit: item.unit,
        isNewPosition: !(existsBefore[i] ?? false),
      });
    });
    onItemsAdded?.(placements);
    return lines;
  };

  const upsertItem = (raw: string | PantryItem | PantryItem[]) => {
    const parsed =
      typeof raw === "string"
        ? parseLoosePantryText(raw)
        : normalizeIncomingItems(raw);
    if (!parsed.length) return;

    // UX-4 - голе хвостове число без одиниці (`ambiguousQty`) не мерджиться
    // мовчки. Продукт, про який людина вже одного разу відповіла «шт» чи
    // «г», проходить одразу (`resolveAmbiguousItemWithMemory`); решта чекає
    // явного тапу в `PantryAmbiguousQtyPrompt`.
    const resolved = parsed.map(resolveAmbiguousItemWithMemory);
    const ready = resolved.filter((item) => !item.ambiguousQty);
    const pending = resolved.filter((item) => item.ambiguousQty);

    if (ready.length > 0) mergeParsedItems(ready);
    if (pending.length > 0) {
      setAmbiguousPantryItems((cur) => [...cur, ...pending]);
    }
  };

  /**
   * Варіант `upsertItem` для автоімпорту Сільпо (спека
   * `docs/work/specs/silpo-pantry-auto-import.md`) - повертає лінії «ключ +
   * додана кількість», потрібні для «Повернути» (`revertReplenish` нижче).
   * Неоднозначні позиції (`ambiguousQty`) просто пропускаються: чек завжди
   * несе явну одиницю через `receiptQtyToBase`, тож підказка «шт чи г?» тут
   * не має предмета, а мовчазний запис без явного підтвердження одиниці -
   * гірший компроміс, ніж пропустити рідкісний край.
   */
  const upsertItemForAutoImport = (
    items: PantryItem[],
  ): PantryReplenishLine[] => {
    const parsed = normalizeIncomingItems(items);
    if (!parsed.length) return [];
    const ready = parsed
      .map(resolveAmbiguousItemWithMemory)
      .filter((item) => !item.ambiguousQty);
    if (!ready.length) return [];
    return mergeParsedItems(ready);
  };

  /**
   * «Повернути» в тості автоімпорту - віднімає рівно додане й видаляє
   * позиції, які створив саме цей імпорт (спека § «Механіка відкату»).
   * Нижня межа 0: якщо продукт устигли частково спожити між імпортом і
   * «Повернути», відкат обрізається на нулі, а не йде в мінус. Позиція, яку
   * до цього імпорту в коморі НЕ було і яка після відкату має 0, видаляється
   * цілком - інші лишаються в списку з нульовим залишком (той самий
   * контракт, що й ручне редагування кількості).
   */
  const revertReplenish = (lines: PantryReplenishLine[]) => {
    // Кінцеву кількість рахуємо зі знімка ДО `setPantries`: updater React
    // виконує відкладено, тож значення, присвоєні всередині нього, подія
    // ledger нижче ще не бачила б і писала б `absQty: 0` на кожну позицію.
    // Лінії групуються: два чеки одного проходу з тим самим продуктом дають
    // дві лінії на одну позицію, і віднімати їх треба разом.
    const groups = new Map<string, PantryReplenishLine>();
    for (const line of lines) {
      const key = matchFoodName(line.itemName);
      if (!key) continue;
      const groupKey = `${line.pantryId}\0${key}`;
      const prev = groups.get(groupKey);
      groups.set(
        groupKey,
        prev
          ? {
              ...prev,
              addedQty: prev.addedQty + line.addedQty,
              isNewPosition: prev.isNewPosition || line.isNewPosition,
            }
          : line,
      );
    }
    for (const line of groups.values()) {
      const key = matchFoodName(line.itemName);
      const current = pantryItems.find(
        (x) => x.pantryId === line.pantryId && matchFoodName(x.name) === key,
      );
      if (!current) continue;
      const nextQty = Math.max(0, (current.qty ?? 0) - line.addedQty);
      const removed = line.isNewPosition && nextQty === 0;
      setPantries((cur) =>
        updatePantry(cur, line.pantryId, (p) => {
          const items = Array.isArray(p.items) ? [...p.items] : [];
          const idx = items.findIndex((x) => matchFoodName(x?.name) === key);
          const item = items[idx];
          if (idx < 0 || !item) return p;
          if (removed) items.splice(idx, 1);
          else items[idx] = { ...item, qty: nextQty };
          return { ...p, items };
        }),
      );
      appendNutritionPantryEvent({
        id: null,
        pantryId: line.pantryId,
        itemId: null,
        itemKey: canonicalFoodKey(line.itemName),
        kind: "adjust",
        deltaQty: null,
        absQty: nextQty,
        unit: line.unit,
        source: "manual",
        mealId: null,
      });
    }
  };

  /**
   * Тап «шт» чи «г» на підказці: пише позицію з обраною одиницею й
   * запамʼятовує вибір для цього продукту (канон nutrition §6 - не питати
   * вдруге про той самий товар). Індекс адресує `ambiguousPantryItems`, не
   * комору.
   */
  const resolveAmbiguousPantryItem = (
    idx: number,
    unit: AmbiguousPantryUnit,
  ) => {
    const item = ambiguousPantryItems[idx];
    if (!item) return;
    rememberAmbiguousUnitChoice(canonicalFoodKey(item.name), unit);
    const { ambiguousQty: _drop, ...rest } = item;
    void _drop;
    mergeParsedItems([{ ...rest, unit }]);
    setAmbiguousPantryItems((cur) => cur.filter((_, i) => i !== idx));
  };

  /** Скасовує додавання позиції з підказки - товар нікуди не пишеться. */
  const dismissAmbiguousPantryItem = (idx: number) => {
    setAmbiguousPantryItems((cur) => cur.filter((_, i) => i !== idx));
  };

  return {
    upsertItem,
    upsertItemForAutoImport,
    revertReplenish,
    ambiguousPantryItems,
    resolveAmbiguousPantryItem,
    dismissAmbiguousPantryItem,
  };
}
