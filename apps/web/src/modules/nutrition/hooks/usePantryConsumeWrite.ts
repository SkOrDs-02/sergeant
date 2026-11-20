/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Списання з комори і його відкат. Винесено з `useNutritionPantries.ts`
 * (Hard Rule #18): той файл ішов під стелю, а відкат списання (OD-27 Х-4 а)
 * додав сюди ще одну операцію.
 *
 * Списання повертає «квитанцію» (`PantryConsumeTicket`): що саме і звідки
 * списано. Вона потрібна «Скасувати» тосту запису страви: скасований запис
 * повертає списане в комору, а не лишає її меншою без пояснення
 * (спека `nutrition-recipes-in-meal-form-and-pantry-deduction.md`).
 *
 * AI-CONTEXT: комора — append-only журнал (ADR-0077). Відкат НЕ видаляє і
 * не править подію `consume`, а дописує чекпойнт `adjust` з новим залишком.
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import {
  applyConsumeToPantryItem,
  updatePantry,
  type Pantry,
  type PantryItemSource,
  type PlacedPantryItem,
} from "@sergeant/nutrition-domain";
import { appendNutritionPantryEvent } from "../lib/nutritionStorage";
import {
  canonicalFoodKey,
  displayFoodName,
  matchFoodName,
  type PantryItem,
} from "../lib/pantryTextParser";

/** Що списання змінило: знімок позиції до і після. */
export interface PantryConsumeReceipt {
  pantryId: string;
  /** Match-ключ назви позиції (`matchFoodName`). */
  itemKey: string;
  before: PantryItem;
  /** `null` — позиція вичерпалась і зникла з комори. */
  after: PantryItem | null;
  /** Списано в одиниці позиції. */
  deducted: number;
  unit: string | null;
}

/**
 * Квитанція одного списання. `receipt` зʼявляється, коли списання справді
 * відбулось: одразу або після вибору варіанта. `cancelled` — запис страви
 * вже скасовано; відкладений вибір варіанта тоді нічого не списує.
 */
export interface PantryConsumeTicket {
  receipt: PantryConsumeReceipt | null;
  cancelled: boolean;
}

export interface PantryVariantChoice {
  itemName: string;
  grams: number;
  sources: readonly PantryItemSource[];
  ticket: PantryConsumeTicket;
}

function withoutPlacement(item: PlacedPantryItem): PantryItem {
  const { pantryId: _pantryId, localIdx: _localIdx, ...rest } = item;
  void _pantryId;
  void _localIdx;
  return rest;
}

export function usePantryConsumeWrite({
  pantryItems,
  setPantries,
}: {
  pantryItems: readonly PlacedPantryItem[];
  setPantries: Dispatch<SetStateAction<Pantry[]>>;
}) {
  // Вибір варіанта при списанні (рішення 11): показується ЛИШЕ коли
  // варіантів два і більше. Списання спрацьовує всередині збереження
  // прийому їжі, тож зайвий діалог у швидкому сценарії дорожчий за
  // точність — на одному варіанті нічого не питаємо.
  const [variantChoice, setVariantChoice] =
    useState<PantryVariantChoice | null>(null);

  // AI-CONTEXT: списує gramsConsumed зі складської позиції, конвертуючи грами
  // в її одиницю через `gramsToUnitQty` (@sergeant/nutrition-domain): г/кг —
  // маса 1:1, мл/л — через грубу таблицю густин, шт — через вагу однієї штуки.
  // `null` означає одиницю без масового відображення (напр. уп) — лишаємо
  // позицію без змін. Раніше тут пропускались усі немасові одиниці; конверсія
  // закриває inventory-drift із F15 (page-audit-08-nutrition) і коректно
  // обробляє кейс H2 ("200 г молока" зі "2 л" ≈ 0.19 л, а не вся пляшка).
  //
  // Розподіл між варіантами і видалення вичерпаних живуть у домені
  // (`applyConsumeToPantryItem`) — там же тримається інваріант суми.
  const applyConsume = (
    name: string,
    gramsConsumed: number,
    variantName: string | null,
    ticket: PantryConsumeTicket,
  ) => {
    if (ticket.cancelled) return;
    const norm = matchFoodName(name);
    if (!norm) return;
    // Списуємо там, де позиція лежить, а не там, куди дивиться екран:
    // прийом їжі не знає й не має знати про фільтр місця.
    const holder = pantryItems.find((x) => matchFoodName(x.name) === norm);
    if (!holder) return;
    const holderId = holder.pantryId;
    // Квитанція — зі знімка цього рендеру, а не зсередини updater-а: його
    // React може виконати відкладено.
    const preview = applyConsumeToPantryItem(
      holder,
      gramsConsumed,
      variantName,
    );
    let deductedQty: number | null = null;
    let deductedUnit: string | null = null;
    setPantries((cur) =>
      updatePantry(cur, holderId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        const idx = items.findIndex((x) => matchFoodName(x?.name) === norm);
        if (idx < 0) return p;
        const item = items[idx];
        if (!item) return p;
        const res = applyConsumeToPantryItem(item, gramsConsumed, variantName);
        if (!res) return p;
        deductedQty = res.deducted;
        deductedUnit = res.unit;
        if (res.item === null) {
          items.splice(idx, 1);
        } else {
          items[idx] = res.item;
        }
        return { ...p, items };
      }),
    );
    // W1-PANTRY-APPEND стадія 2 — audit E-2: це саме той шлях, який ADR-0077
    // закриває. 'consume' несе РЕАЛЬНО списану дельту (`deducted` = qty до
    // мінус qty після; при вичерпанні — сира перевитрата), а не вигадану —
    // batch-страва все одно дасть
    // N подій на N логів, і це навмисно ВИДИМО, а не приховано (ADR §6).
    if (deductedQty != null) {
      appendNutritionPantryEvent({
        id: null,
        pantryId: holderId,
        itemId: holder.id ?? null,
        itemKey: canonicalFoodKey(norm),
        kind: "consume",
        deltaQty: -deductedQty,
        absQty: null,
        unit: deductedUnit,
        source: "meal_log",
        mealId: null,
      });
    }
    if (preview) {
      ticket.receipt = {
        pantryId: holderId,
        itemKey: norm,
        before: withoutPlacement(holder),
        after: preview.item,
        deducted: preview.deducted,
        unit: preview.unit,
      };
    }
  };

  const consumePantryItem = (
    name: string,
    gramsConsumed: number,
  ): PantryConsumeTicket => {
    const ticket: PantryConsumeTicket = { receipt: null, cancelled: false };
    const norm = matchFoodName(name);
    if (!norm) return ticket;
    const target = pantryItems.find((x) => matchFoodName(x?.name) === norm);
    const sources = Array.isArray(target?.sources) ? target.sources : [];
    if (target && sources.length >= 2) {
      setVariantChoice({
        itemName: displayFoodName(target.name),
        grams: gramsConsumed,
        sources,
        ticket,
      });
      return ticket;
    }
    applyConsume(name, gramsConsumed, null, ticket);
    return ticket;
  };

  /**
   * Закриває вибір варіанта. `null` = «з найстарішого» — і це ж поведінка
   * при закритті діалогу: прийом їжі вже збережено, тож не списати нічого
   * означало б лишити комору з завищеним залишком. Запис, скасований поки
   * діалог був відкритий, не списує нічого (`ticket.cancelled`).
   */
  const resolveVariantChoice = (variantName: string | null) => {
    if (!variantChoice) return;
    applyConsume(
      variantChoice.itemName,
      variantChoice.grams,
      variantName,
      variantChoice.ticket,
    );
    setVariantChoice(null);
  };

  /**
   * Повертає списане за квитанцією. Позиція не мінялась після списання —
   * відновлюється знімок «до» (з варіантами); вичерпана й зникла —
   * повертається цілком; змінилась іншим шляхом — до її залишку додається
   * списане, а варіанти скидаються (той самий контракт, що й ручна зміна
   * кількості: сума варіантів інакше розійшлась би з кількістю). Позицію,
   * яку людина видалила сама, не воскрешаємо. `true` — повернуто.
   */
  const revertConsume = (receipt: PantryConsumeReceipt): boolean => {
    const key = receipt.itemKey;
    const current = pantryItems.find(
      (x) => x.pantryId === receipt.pantryId && matchFoodName(x.name) === key,
    );
    let restored: PantryItem | null;
    if (!current) {
      restored = receipt.after === null ? receipt.before : null;
    } else if (receipt.after && current.qty === receipt.after.qty) {
      restored = {
        ...withoutPlacement(current),
        qty: receipt.before.qty,
        sources: receipt.before.sources ?? null,
      };
    } else {
      const qty = (Number(current.qty) || 0) + receipt.deducted;
      restored = {
        ...withoutPlacement(current),
        qty: Math.round(qty * 1000) / 1000,
        sources: null,
      };
    }
    if (!restored) return false;
    const next = restored;
    setPantries((cur) =>
      updatePantry(cur, receipt.pantryId, (p) => {
        const items = Array.isArray(p.items) ? [...p.items] : [];
        const idx = items.findIndex((x) => matchFoodName(x?.name) === key);
        if (idx < 0) items.push(next);
        else items[idx] = next;
        return { ...p, items };
      }),
    );
    if (next.qty != null) {
      appendNutritionPantryEvent({
        id: null,
        pantryId: receipt.pantryId,
        itemId: next.id ?? null,
        itemKey: canonicalFoodKey(key),
        kind: "adjust",
        deltaQty: null,
        absQty: next.qty,
        unit: next.unit ?? null,
        source: "meal_log",
        mealId: null,
      });
    }
    return true;
  };

  return {
    consumePantryItem,
    variantChoice,
    resolveVariantChoice,
    revertConsume,
  };
}
