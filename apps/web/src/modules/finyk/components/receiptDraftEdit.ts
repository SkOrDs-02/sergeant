/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Чисті immutable-хелпери для редагування `ReceiptDraft` на review-екрані
 * (спека § Web UI: "редаговані поля, категорія — дропдаун, позиції
 * списком"). Без React — легко тестувати окремо від форми.
 */
import type { ReceiptDraft, ReceiptDraftItem } from "@sergeant/api-client";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { toExpenseInstant } from "./manualExpenseForm";

export function updateDraftStore(
  draft: ReceiptDraft,
  store: string,
): ReceiptDraft {
  return { ...draft, store };
}

export function updateDraftTotalKopiykas(
  draft: ReceiptDraft,
  totalKopiykas: number,
): ReceiptDraft {
  return { ...draft, totalKopiykas };
}

/** `dayKey` — `YYYY-MM-DD`, той самий формат, що `<input type="date">`
 * повертає. Час доби НЕ зберігається за редагування (noon-UTC трюк,
 * той самий, що `manualExpenseForm.ts::toExpenseInstant` для ручних
 * витрат) — точна секунда покупки не є полем, яке review-екран показує
 * чи дає редагувати; важливий лише календарний день. */
export function updateDraftDate(
  draft: ReceiptDraft,
  dayKey: string,
): ReceiptDraft {
  return { ...draft, purchasedAt: toExpenseInstant(dayKey) };
}

/** Kyiv-календарний день покупки — для початкового значення
 * `<input type="date">` (той самий Kyiv-режим, що фінансові періоди
 * домену; ADR-0078 тут НЕ застосовний — це не device-local особиста
 * доба, а серверний момент покупки). */
export function draftDateKey(draft: ReceiptDraft): string {
  return getKyivDayKey(new Date(draft.purchasedAt));
}

export type EditableItemField =
  "name" | "qty" | "priceKopiykas" | "sumKopiykas";

export function updateDraftItem(
  draft: ReceiptDraft,
  index: number,
  patch: Partial<Pick<ReceiptDraftItem, EditableItemField>>,
): ReceiptDraft {
  return {
    ...draft,
    items: draft.items.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    ),
  };
}

export function removeDraftItem(
  draft: ReceiptDraft,
  index: number,
): ReceiptDraft {
  return { ...draft, items: draft.items.filter((_, i) => i !== index) };
}

/** Наступна вільна `position` — 1-based, з урахуванням позицій, що вже
 * могли лишити «дірки» після видалення. */
function nextPosition(items: readonly ReceiptDraftItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.position), 0) + 1;
}

export function addBlankDraftItem(draft: ReceiptDraft): ReceiptDraft {
  const item: ReceiptDraftItem = {
    position: nextPosition(draft.items),
    name: "",
    qty: 1,
    priceKopiykas: 0,
    sumKopiykas: 0,
  };
  return { ...draft, items: [...draft.items, item] };
}

/** Порожній vision-драфт (жодного розпізнаного поля) — найімовірніше на
 * фото взагалі не чек (бета-фідбек 2026-08-18: фото кавуна давало мовчазні
 * порожні поля). Реальний чек завжди має хоч щось із трійки. Спільний
 * предикат для банера одиночного флоу (`ReceiptScanSheet`) і бейджа/
 * авто-виключення рядка пачки (`useBulkReceiptsImport` +
 * `BulkReceiptsProgress`) — бета-фідбек №3. */
export function draftLooksUnrecognized(draft: ReceiptDraft): boolean {
  return draft.items.length === 0 && draft.totalKopiykas === 0 && !draft.store;
}
