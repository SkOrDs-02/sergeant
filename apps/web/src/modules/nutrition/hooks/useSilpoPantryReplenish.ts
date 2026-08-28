/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * Поповнення комори з куплених продуктів Сільпо (Silpo integration трек C,
 * спека `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * «Комора — через готовий ledger»).
 *
 * AI-CONTEXT: жодного нового шляху запису в комору — позиції, які
 * користувач підтвердив, ідуть через ІСНУЮЧИЙ `pantry.upsertItem`
 * (`useNutritionPantries.ts`): він сам мерджить за `canonicalFoodKey`
 * (зматчена позиція комори росте на дельту) або створює нову позицію
 * («нерозпізнане — пропозиція нової позиції», спека), і сам емітить
 * `replenish`-подію в ledger для кожної позиції з відомою кількістю. Цей
 * хук лише читає чеки Сільпо (`@finyk/hooks/useSilpoReceipts`, read-only
 * REST — не dual-write, спека § «Sync у клієнт») і будує превʼю
 * зіставлення, нічого не пише мовчки: `confirm()` викликається лише
 * явним тапом користувача.
 */
import { useMemo, useState } from "react";
import { mapReceiptItemToCategory } from "@sergeant/finyk-domain/domain";
import {
  buildPantryIndex,
  displayFoodName,
  findPantryMatch,
} from "@sergeant/nutrition-domain";
import {
  useSilpoReceipts,
  useSilpoReceiptDetail,
} from "@finyk/hooks/useSilpoReceipts";
import type { SilpoReceiptItemDto } from "@shared/api";
import type { PantryItem } from "../lib/pantryTextParser";

/** Скільки останніх чеків пропонуємо на вибір — «останні чеки», не архів. */
const RECEIPTS_LIMIT = 10;

export interface SilpoReplenishRow {
  item: SilpoReceiptItemDto;
  /** finyk-категорія позиції (детермінований мапер, `@sergeant/finyk-domain`). */
  category: string;
  /** Display-назва існуючої позиції комори, якщо знайдено збіг за `canonicalFoodKey`. `null` = «нова позиція». */
  matchedName: string | null;
  checked: boolean;
}

export interface UseSilpoPantryReplenishParams {
  /** Хук фетчить чеки лише поки `true` — керує викликач (напр. відкритий sheet). */
  enabled: boolean;
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
}

export function useSilpoPantryReplenish({
  enabled,
  pantryItems,
  upsertItem,
}: UseSilpoPantryReplenishParams) {
  const receiptsQuery = useSilpoReceipts(
    { limit: RECEIPTS_LIMIT },
    { enabled },
  );
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(
    null,
  );

  // Дефолт — найсвіжіший чек (сервер уже сортує `purchasedAt DESC` —
  // `silpo.ts` endpoint doc). Спека § Фази: «вибір чека (або одразу
  // останній)» — застосовується лише поки користувач ще нічого не обрав.
  // Render-phase adjustment, не `useEffect` + `setState` (react-hooks/
  // set-state-in-effect) — той самий idiom, що seed чекбоксів нижче.
  if (enabled && selectedReceiptId == null) {
    const first = receiptsQuery.receipts[0];
    if (first) setSelectedReceiptId(first.receiptId);
  }

  const detailQuery = useSilpoReceiptDetail(enabled ? selectedReceiptId : null);
  const items = useMemo(
    () => detailQuery.data?.items ?? [],
    [detailQuery.data],
  );

  // Нормалізовані назви комори рахуються ОДИН раз на комору, а не заново
  // для кожного рядка чека: інакше 200 позицій × десятки продуктів дають
  // десятки тисяч regex-спліт на кожен рендер `rows`.
  const pantryIndex = useMemo(
    () => buildPantryIndex(pantryItems),
    [pantryItems],
  );

  const [checkedState, setCheckedState] = useState<Record<number, boolean>>({});
  // Один чекпойнт "seed" на чек: перезаходити в дефолти щоразу, коли
  // юзер сам щось перемкнув, не можна — тому порівнюємо не з `items`, а з
  // `selectedReceiptId`. Render-phase adjustment (той самий патерн, що
  // `PantryManagerSheet`/`useNutritionPantries` вже використовують) —
  // React переграє цей рендер одразу з оновленим станом.
  const [seededReceiptId, setSeededReceiptId] = useState<string | null>(null);
  if (selectedReceiptId !== seededReceiptId && items.length > 0) {
    const next: Record<number, boolean> = {};
    for (const it of items) {
      // Дефолт: їстівне — увімкнено, не-groceries (побутова хімія,
      // аптека/гігієна) — вимкнено (спека § Рішення дизайну; мапер
      // `mapReceiptItemToCategory` повертає "groceries" за замовчуванням
      // для нерозпізнаного, тож "не вгадали" теж лягає в "увімкнено").
      next[it.id] = mapReceiptItemToCategory(it) === "groceries";
    }
    setSeededReceiptId(selectedReceiptId);
    setCheckedState(next);
  }

  const rows: SilpoReplenishRow[] = useMemo(
    () =>
      items.map((item) => {
        // `findPantryMatch` бере на себе і точний збіг ключів (те, що тут
        // було раніше), і випадок «коротка назва комори всередині довгої
        // назви з чека» — саме він створював дублі замість доливання.
        const match = findPantryMatch(item.name, pantryIndex);
        return {
          item,
          category: mapReceiptItemToCategory(item),
          matchedName: match ? displayFoodName(match.name) : null,
          checked:
            checkedState[item.id] ??
            mapReceiptItemToCategory(item) === "groceries",
        };
      }),
    [items, pantryIndex, checkedState],
  );

  const checkedCount = rows.reduce((n, r) => (r.checked ? n + 1 : n), 0);

  function selectReceipt(receiptId: string) {
    if (receiptId === selectedReceiptId) return;
    setSelectedReceiptId(receiptId);
  }

  function toggleItem(itemId: number) {
    // Поточне значення обчислюється всередині updater-а, а не приходить
    // аргументом із рендера: значення з JSX може застаріти між reseed-ом
    // (зміна вибраного чека) і кліком. Fallback — той самий дефолт, що й
    // у seed-а та `rows`: їстівне (`groceries`) — увімкнено.
    setCheckedState((cur) => {
      const item = items.find((it) => it.id === itemId);
      const current =
        cur[itemId] ??
        (item != null && mapReceiptItemToCategory(item) === "groceries");
      return { ...cur, [itemId]: !current };
    });
  }

  /** Пише `replenish` для кожної підтвердженої позиції. Повертає скільки додано (0 — нема що писати, викликач нічого не робить). */
  function confirm(): number {
    const checked = rows.filter((r) => r.checked);
    if (checked.length === 0) return 0;
    const toAdd: PantryItem[] = checked.map((r) => ({
      name: r.item.name,
      qty: r.item.qty,
      unit: r.item.unit,
      notes: null,
    }));
    upsertItem(toAdd);
    return toAdd.length;
  }

  /** Скидає локальний вибір чека/чекбоксів — виклик при закритті sheet-а. */
  function reset() {
    setSelectedReceiptId(null);
    setSeededReceiptId(null);
    setCheckedState({});
  }

  return {
    receipts: receiptsQuery.receipts,
    receiptsLoading: receiptsQuery.isLoading,
    selectedReceiptId,
    selectReceipt,
    detailLoading: detailQuery.isLoading,
    rows,
    checkedCount,
    toggleItem,
    confirm,
    reset,
  };
}
