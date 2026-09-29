/**
 * Last validated: 2026-09-29
 * Status: Active
 *
 * Поповнення комори з куплених продуктів Сільпо (Silpo integration трек C,
 * спека `docs/work/specs/silpo-mcp-integration.md` §
 * «Комора - через готовий ledger», далі розширена спекою
 * `docs/work/specs/silpo-pantry-auto-import.md` позначкою «вже в коморі» і
 * бронюванням).
 *
 * AI-CONTEXT: жодного нового шляху запису в комору — позиції, які
 * користувач підтвердив, ідуть через ІСНУЮЧИЙ `pantry.upsertItem`
 * (`useNutritionPantries.ts`), а побудова рядків і перетворення на
 * `PantryItem[]` живуть у чистих функціях `../lib/silpoReplenish.ts` -
 * той самий код, що й автоімпорт (`useSilpoPantryAutoImport`). Цей хук
 * лише читає чеки Сільпо (`@finyk/hooks/useSilpoReceipts`) і керує
 * ручним підтвердженням: `confirm()` спершу БРОНЮЄ обрані позиції
 * (`pantry-claim`, `mode: "manual"`), і лише заброньовані сервером пише.
 */
import { useMemo, useState } from "react";
import { buildPantryIndex } from "@sergeant/nutrition-domain";
import {
  useSilpoReceipts,
  useSilpoReceiptDetail,
  usePantryClaim,
} from "@finyk/hooks/useSilpoReceipts";
import {
  buildSilpoReplenishRows,
  rowsToPantryItems,
} from "../lib/silpoReplenish";
import type { PantryItem } from "../lib/pantryTextParser";

/** Скільки останніх чеків пропонуємо на вибір — «останні чеки», не архів. */
const RECEIPTS_LIMIT = 10;

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
  const claim = usePantryClaim();
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(
    null,
  );

  // Дефолт — найсвіжіший чек (сервер уже сортує `purchasedAt DESC` —
  // `silpo.ts` endpoint doc). Render-phase adjustment, не `useEffect` +
  // `setState` - той самий idiom, що seed чекбоксів нижче.
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
  // для кожного рядка чека.
  const pantryIndex = useMemo(
    () => buildPantryIndex(pantryItems),
    [pantryItems],
  );

  const [checkedState, setCheckedState] = useState<Record<number, boolean>>({});
  // Один чекпойнт "seed" на чек: перезаходити в дефолти щоразу, коли юзер
  // сам щось перемкнув, не можна - тому порівнюємо не з `items`, а з
  // `selectedReceiptId`.
  const [seededReceiptId, setSeededReceiptId] = useState<string | null>(null);
  if (selectedReceiptId !== seededReceiptId && items.length > 0) {
    setSeededReceiptId(selectedReceiptId);
    setCheckedState({});
  }

  const [keepFullState, setKeepFullState] = useState<Record<number, boolean>>(
    {},
  );

  const rows = useMemo(
    () =>
      buildSilpoReplenishRows({
        items,
        pantryIndex,
        checkedState,
        keepFullState,
      }),
    [items, pantryIndex, checkedState, keepFullState],
  );

  const checkedCount = rows.reduce((n, r) => (r.checked ? n + 1 : n), 0);

  function selectReceipt(receiptId: string) {
    if (receiptId === selectedReceiptId) return;
    setSelectedReceiptId(receiptId);
  }

  function toggleItem(itemId: number) {
    // Поточне значення обчислюється всередині updater-а - значення з JSX
    // може застаріти між reseed-ом (зміна вибраного чека) і кліком.
    setCheckedState((cur) => {
      const row = rows.find((r) => r.item.id === itemId);
      const current = cur[itemId] ?? row?.checked ?? false;
      return { ...cur, [itemId]: !current };
    });
  }

  /**
   * Бронює обрані позиції (`mode: "manual"` - бронює навіть уже
   * заброньоване, ручний потік завжди дозволяє «додати ще раз»), пише в
   * комору ЛИШЕ те, що сервер підтвердив заброньованим, і повертає скільки
   * додано (0 — нема що писати, викликач нічого не робить).
   */
  async function confirm(): Promise<number> {
    const checked = rows.filter((r) => r.checked);
    if (checked.length === 0 || !selectedReceiptId) return 0;
    const receipt = receiptsQuery.receipts.find(
      (r) => r.receiptId === selectedReceiptId,
    );
    const claimedItemIds = await claim.claim(
      selectedReceiptId,
      checked.map((r) => r.item.id),
      "manual",
    );
    const claimedRows = checked.filter((r) =>
      claimedItemIds.includes(r.item.id),
    );
    if (claimedRows.length === 0) return 0;
    const purchasedAt = receipt?.purchasedAt ?? new Date();
    const toAdd = rowsToPantryItems(claimedRows, purchasedAt);
    upsertItem(toAdd);
    return toAdd.length;
  }

  function toggleKeepFull(itemId: number) {
    setKeepFullState((cur) => ({ ...cur, [itemId]: !cur[itemId] }));
  }

  /** Скидає локальний вибір чека/чекбоксів — виклик при закритті sheet-а. */
  function reset() {
    setSelectedReceiptId(null);
    setSeededReceiptId(null);
    setCheckedState({});
    setKeepFullState({});
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
    toggleKeepFull,
    confirm,
    confirmPending: claim.isPending,
    reset,
  };
}
