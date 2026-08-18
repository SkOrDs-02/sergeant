// @vitest-environment jsdom
/**
 * `useSilpoPantryReplenish` — покриває три речі, які спека вважає
 * критичними (silpo-mcp-integration.md § «Комора — через готовий
 * ledger»):
 *  1. зіставлення позицій чека з коморою за `canonicalFoodKey`
 *     (norm-збіг → `matchedName`, нерозпізнане → `matchedName: null`
 *     = «нова позиція»);
 *  2. дефолтні чекбокси: їстівне (`groceries`) — увімкнено, не-groceries
 *     (побутова хімія/аптека) — вимкнено;
 *  3. `confirm()` пише через ІСНУЮЧИЙ `upsertItem` — нічого мовчки.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SilpoReceiptDetailDto } from "@shared/api";

const receiptsMock = vi.fn();
const receiptDetailMock = vi.fn();

vi.mock("@finyk/hooks/useSilpoReceipts", () => ({
  useSilpoReceipts: (...args: unknown[]) => receiptsMock(...args),
  useSilpoReceiptDetail: (...args: unknown[]) => receiptDetailMock(...args),
}));

import { useSilpoPantryReplenish } from "./useSilpoPantryReplenish";

const RECEIPT_SUMMARY = {
  receiptId: "rcpt-1",
  purchasedAt: "2026-08-17T10:00:00.000Z",
  storeId: "store-1",
  channel: "offline" as const,
  paymentHint: "card",
  totalKop: 100000,
  transactionId: null,
};

function detailWithItems(
  items: SilpoReceiptDetailDto["items"],
): SilpoReceiptDetailDto {
  return { ...RECEIPT_SUMMARY, items };
}

function mockReceipts(receipts: (typeof RECEIPT_SUMMARY)[]) {
  receiptsMock.mockReturnValue({
    receipts,
    isLoading: false,
  });
}

function mockDetail(detail: SilpoReceiptDetailDto | null, isLoading = false) {
  receiptDetailMock.mockReturnValue({ data: detail, isLoading });
}

describe("useSilpoPantryReplenish", () => {
  beforeEach(() => {
    receiptsMock.mockReset();
    receiptDetailMock.mockReset();
    mockReceipts([]);
    mockDetail(null);
  });

  it("defaults to the freshest (first) receipt when nothing is selected yet", () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(detailWithItems([]));

    const { result } = renderHook(() =>
      useSilpoPantryReplenish({
        enabled: true,
        pantryItems: [],
        upsertItem: vi.fn(),
      }),
    );

    expect(result.current.selectedReceiptId).toBe("rcpt-1");
  });

  it("matches a receipt item to an existing pantry item via canonicalFoodKey", () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(
      detailWithItems([
        {
          id: 1,
          name: "молоко яготинське 900г",
          qty: 1,
          unit: "шт",
          priceKop: 4500,
          categorySlug: null,
          barcode: null,
        },
      ]),
    );

    const { result } = renderHook(() =>
      useSilpoPantryReplenish({
        enabled: true,
        pantryItems: [{ name: "Молоко Яготинське 900г" }],
        upsertItem: vi.fn(),
      }),
    );

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]?.matchedName).toBe("Молоко Яготинське 900г");
  });

  it("marks an unrecognized item as a new position (matchedName: null)", () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(
      detailWithItems([
        {
          id: 2,
          name: "Авокадо Хаас",
          qty: 2,
          unit: "шт",
          priceKop: 8000,
          categorySlug: null,
          barcode: null,
        },
      ]),
    );

    const { result } = renderHook(() =>
      useSilpoPantryReplenish({
        enabled: true,
        pantryItems: [{ name: "Молоко" }],
        upsertItem: vi.fn(),
      }),
    );

    expect(result.current.rows[0]?.matchedName).toBeNull();
  });

  it("defaults edible (groceries) items to checked, non-groceries to unchecked", () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(
      detailWithItems([
        {
          id: 1,
          name: "Курка гомілка",
          qty: 1,
          unit: "кг",
          priceKop: 12000,
          categorySlug: null,
          barcode: null,
        },
        {
          id: 2,
          name: "Пральний порошок Persil 2.4кг",
          qty: 1,
          unit: "шт",
          priceKop: 30000,
          categorySlug: null,
          barcode: null,
        },
        {
          id: 3,
          name: "Зубна паста Sensodyne 75мл",
          qty: 1,
          unit: "шт",
          priceKop: 15000,
          categorySlug: null,
          barcode: null,
        },
      ]),
    );

    const { result } = renderHook(() =>
      useSilpoPantryReplenish({
        enabled: true,
        pantryItems: [],
        upsertItem: vi.fn(),
      }),
    );

    const byId = new Map(result.current.rows.map((r) => [r.item.id, r]));
    expect(byId.get(1)?.checked).toBe(true); // "Курка" → groceries → on
    expect(byId.get(2)?.checked).toBe(false); // "Пральний порошок" → shopping → off
    expect(byId.get(3)?.checked).toBe(false); // "Зубна паста" → health → off
    expect(result.current.checkedCount).toBe(1);
  });

  it("toggleItem flips a single row without touching the others", () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(
      detailWithItems([
        {
          id: 1,
          name: "Хліб",
          qty: 1,
          unit: "шт",
          priceKop: 3000,
          categorySlug: null,
          barcode: null,
        },
        {
          id: 2,
          name: "Корм для котів Whiskas",
          qty: 1,
          unit: "шт",
          priceKop: 9000,
          categorySlug: null,
          barcode: null,
        },
      ]),
    );

    const { result } = renderHook(() =>
      useSilpoPantryReplenish({
        enabled: true,
        pantryItems: [],
        upsertItem: vi.fn(),
      }),
    );

    act(() => result.current.toggleItem(2, false));
    const byId = new Map(result.current.rows.map((r) => [r.item.id, r]));
    expect(byId.get(1)?.checked).toBe(true);
    expect(byId.get(2)?.checked).toBe(true);
  });

  it("confirm() writes checked items through the existing upsertItem mechanism, unchecked items are skipped", () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(
      detailWithItems([
        {
          id: 1,
          name: "Хліб",
          qty: 1,
          unit: "шт",
          priceKop: 3000,
          categorySlug: null,
          barcode: null,
        },
        {
          id: 2,
          name: "Пральний порошок Persil",
          qty: 1,
          unit: "шт",
          priceKop: 30000,
          categorySlug: null,
          barcode: null,
        },
      ]),
    );
    const upsertItem = vi.fn();

    const { result } = renderHook(() =>
      useSilpoPantryReplenish({
        enabled: true,
        pantryItems: [],
        upsertItem,
      }),
    );

    let added = 0;
    act(() => {
      added = result.current.confirm();
    });

    expect(added).toBe(1);
    expect(upsertItem).toHaveBeenCalledTimes(1);
    expect(upsertItem).toHaveBeenCalledWith([
      { name: "Хліб", qty: 1, unit: "шт", notes: null },
    ]);
  });

  it("confirm() is a no-op (nothing written) when nothing is checked", () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(
      detailWithItems([
        {
          id: 1,
          name: "Пральний порошок Persil",
          qty: 1,
          unit: "шт",
          priceKop: 30000,
          categorySlug: null,
          barcode: null,
        },
      ]),
    );
    const upsertItem = vi.fn();

    const { result } = renderHook(() =>
      useSilpoPantryReplenish({ enabled: true, pantryItems: [], upsertItem }),
    );

    let added = -1;
    act(() => {
      added = result.current.confirm();
    });

    expect(added).toBe(0);
    expect(upsertItem).not.toHaveBeenCalled();
  });

  it("reset() clears the selection back to the initial empty state (mirrors sheet-close: enabled flips to false first)", async () => {
    mockReceipts([RECEIPT_SUMMARY]);
    mockDetail(detailWithItems([]));

    // `enabled` mirrors `open` in `SilpoPantryReplenishSheet` — reset() is
    // only ever called there in the same render pass `open` becomes
    // `false`, which is exactly what a plain `enabled: true` call would
    // NOT reproduce (the auto-select-latest effect would just re-fire and
    // put the id right back).
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useSilpoPantryReplenish({
          enabled,
          pantryItems: [],
          upsertItem: vi.fn(),
        }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() =>
      expect(result.current.selectedReceiptId).toBe("rcpt-1"),
    );

    rerender({ enabled: false });
    act(() => result.current.reset());
    expect(result.current.selectedReceiptId).toBeNull();
  });
});
