// @vitest-environment jsdom
/**
 * `useSilpoPantryAutoImport` - спека
 * `docs/work/specs/silpo-pantry-auto-import.md`. Критичні інваріанти:
 *  1. автоімпорт пише ЛИШЕ заброньовані сервером позиції;
 *  2. помилка `upsertItemForAutoImport` викликає `pantry-release` без
 *     відхилення чека;
 *  3. вимкнений тумблер - жодного запиту чеків узагалі.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SilpoReceiptDetailDto } from "@shared/api";
import type { PantryReplenishLine } from "./useNutritionPantries";
import type { PantryItem } from "../lib/pantryTextParser";

const syncStateMock = vi.fn();
const receiptsMock = vi.fn();
const claimMock = vi.fn();
const releaseMock = vi.fn();
const receiptDetailApiMock = vi.fn();
const receiptsApiMock = vi.fn();
const toastShowMock = vi.fn();

vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: (...args: unknown[]) => syncStateMock(...args),
}));
vi.mock("@finyk/hooks/useSilpoReceipts", () => ({
  useSilpoReceipts: (...args: unknown[]) => receiptsMock(...args),
  usePantryClaim: () => ({ claim: claimMock, isPending: false }),
  usePantryRelease: () => ({ release: releaseMock }),
}));
vi.mock("@shared/api", () => ({
  silpoApi: {
    receiptDetail: (...args: unknown[]) => receiptDetailApiMock(...args),
    receipts: (...args: unknown[]) => receiptsApiMock(...args),
  },
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    show: toastShowMock,
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  }),
}));

import { useSilpoPantryAutoImport } from "./useSilpoPantryAutoImport";

const RECEIPT = {
  receiptId: "rcpt-1",
  purchasedAt: "2026-09-25T10:00:00.000Z",
  storeId: "store-1",
  channel: "offline" as const,
  paymentHint: "card",
  totalKop: 50000,
  transactionId: null,
  pantryClaimedCount: 0,
  pantryAutoDeclined: false,
};

function detail(items: SilpoReceiptDetailDto["items"]): SilpoReceiptDetailDto {
  return { ...RECEIPT, items };
}

function groceryItem(
  id: number,
  overrides: Partial<SilpoReceiptDetailDto["items"][number]> = {},
) {
  return {
    id,
    name: "Хліб",
    qty: 1,
    unit: "шт",
    priceKop: 3000,
    categorySlug: null,
    barcode: null,
    pantryClaimedAt: null,
    ...overrides,
  };
}

function renderAutoImport(
  overrides: {
    upsertItemForAutoImport?: (items: PantryItem[]) => PantryReplenishLine[];
    revertReplenish?: (lines: PantryReplenishLine[]) => void;
  } = {},
) {
  const upsertItemForAutoImport =
    overrides.upsertItemForAutoImport ??
    vi.fn<(items: PantryItem[]) => PantryReplenishLine[]>().mockReturnValue([]);
  const revertReplenish =
    overrides.revertReplenish ??
    vi.fn<(lines: PantryReplenishLine[]) => void>();
  const utils = renderHook(() =>
    useSilpoPantryAutoImport({
      pantryItems: [],
      upsertItemForAutoImport,
      revertReplenish,
    }),
  );
  return { ...utils, upsertItemForAutoImport, revertReplenish };
}

describe("useSilpoPantryAutoImport", () => {
  beforeEach(() => {
    syncStateMock.mockReset();
    receiptsMock.mockReset();
    claimMock.mockReset();
    releaseMock.mockReset();
    receiptDetailApiMock.mockReset();
    toastShowMock.mockReset();
    releaseMock.mockResolvedValue(undefined);
    receiptsApiMock.mockReset();
    receiptsApiMock.mockResolvedValue({ data: [RECEIPT], nextCursor: null });
  });

  it("проходить усі сторінки до першого чека, старшого за увімкнення", async () => {
    syncStateMock.mockReturnValue({
      status: "connected",
      data: { pantryAutoImportSince: "2026-09-20T00:00:00.000Z" },
    });
    receiptsMock.mockReturnValue({ receipts: [RECEIPT] });
    const older = {
      ...RECEIPT,
      receiptId: "rcpt-2",
      purchasedAt: "2026-09-21T10:00:00.000Z",
    };
    const tooOld = {
      ...RECEIPT,
      receiptId: "rcpt-3",
      purchasedAt: "2026-09-19T10:00:00.000Z",
    };
    receiptsApiMock
      .mockResolvedValueOnce({ data: [RECEIPT], nextCursor: "c1" })
      .mockResolvedValueOnce({ data: [older, tooOld], nextCursor: "c2" });
    receiptDetailApiMock.mockResolvedValue(detail([]));

    renderAutoImport();

    await waitFor(() => expect(receiptDetailApiMock).toHaveBeenCalledTimes(2));
    expect(receiptDetailApiMock.mock.calls.map((c) => c[0])).toEqual([
      "rcpt-1",
      "rcpt-2",
    ]);
    expect(receiptsApiMock).toHaveBeenCalledTimes(2);
    expect(receiptsApiMock.mock.calls[1]![0]).toMatchObject({ cursor: "c1" });
  });

  it("чек із тимчасовою помилкою пробується знову на наступному оновленні", async () => {
    syncStateMock.mockReturnValue({
      status: "connected",
      data: { pantryAutoImportSince: "2026-09-20T00:00:00.000Z" },
    });
    receiptsMock.mockReturnValue({ receipts: [RECEIPT] });
    receiptDetailApiMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(detail([groceryItem(1)]));
    claimMock.mockResolvedValue([1]);

    const { rerender } = renderAutoImport();
    await waitFor(() => expect(receiptDetailApiMock).toHaveBeenCalledTimes(1));

    receiptsMock.mockReturnValue({ receipts: [{ ...RECEIPT }] });
    rerender();

    await waitFor(() =>
      expect(claimMock).toHaveBeenCalledWith("rcpt-1", [1], "auto"),
    );
  });

  it("вимкнений тумблер - жодного запиту чеків", () => {
    syncStateMock.mockReturnValue({
      status: "connected",
      data: { pantryAutoImportSince: null },
    });
    receiptsMock.mockReturnValue({ receipts: [] });

    renderAutoImport();

    expect(receiptsMock).toHaveBeenCalledWith(
      { limit: 10 },
      { enabled: false },
    );
    expect(receiptDetailApiMock).not.toHaveBeenCalled();
  });

  it("пише лише заброньовані сервером позиції (друге бронювання повертає порожньо)", async () => {
    syncStateMock.mockReturnValue({
      status: "connected",
      data: { pantryAutoImportSince: "2026-09-20T00:00:00.000Z" },
    });
    receiptsMock.mockReturnValue({ receipts: [RECEIPT] });
    receiptDetailApiMock.mockResolvedValue(
      detail([groceryItem(1), groceryItem(2)]),
    );
    // Сервер заброньував лише позицію 1 - позицію 2 вже взяв інший пристрій.
    claimMock.mockResolvedValue([1]);
    const upsertItemForAutoImport = vi
      .fn<(items: PantryItem[]) => PantryReplenishLine[]>()
      .mockReturnValue([
        {
          pantryId: "p1",
          itemName: "Хліб",
          addedQty: 1,
          unit: "шт",
          isNewPosition: true,
          source: null,
        },
      ]);

    renderAutoImport({ upsertItemForAutoImport });

    await waitFor(() => expect(claimMock).toHaveBeenCalled());
    expect(claimMock).toHaveBeenCalledWith("rcpt-1", [1, 2], "auto");

    await waitFor(() => expect(upsertItemForAutoImport).toHaveBeenCalled());
    const written = upsertItemForAutoImport.mock.calls[0]![0] as Array<{
      name: string;
    }>;
    expect(written).toHaveLength(1);

    await waitFor(() => expect(toastShowMock).toHaveBeenCalled());
    expect(toastShowMock.mock.calls[0]![0]).toBe(
      "Додано 1 продукт з чека Сільпо",
    );
  });

  it("помилка upsertItemForAutoImport викликає pantry-release без decline", async () => {
    syncStateMock.mockReturnValue({
      status: "connected",
      data: { pantryAutoImportSince: "2026-09-20T00:00:00.000Z" },
    });
    receiptsMock.mockReturnValue({ receipts: [RECEIPT] });
    receiptDetailApiMock.mockResolvedValue(detail([groceryItem(1)]));
    claimMock.mockResolvedValue([1]);
    const upsertItemForAutoImport = vi
      .fn<(items: PantryItem[]) => PantryReplenishLine[]>()
      .mockImplementation(() => {
        throw new Error("boom");
      });

    renderAutoImport({ upsertItemForAutoImport });

    await waitFor(() => expect(releaseMock).toHaveBeenCalled());
    expect(releaseMock).toHaveBeenCalledWith("rcpt-1", [1], false);
    expect(toastShowMock).not.toHaveBeenCalled();
  });

  it("при вимкненому тумблері (pantryAutoImportSince: null) автоімпорт нічого не робить", () => {
    syncStateMock.mockReturnValue({
      status: "connected",
      data: { pantryAutoImportSince: null },
    });
    receiptsMock.mockReturnValue({ receipts: [RECEIPT] });

    renderAutoImport();

    expect(receiptDetailApiMock).not.toHaveBeenCalled();
    expect(claimMock).not.toHaveBeenCalled();
  });

  it("«Повернути» відкочує лінії і звільняє бронювання з decline", async () => {
    syncStateMock.mockReturnValue({
      status: "connected",
      data: { pantryAutoImportSince: "2026-09-20T00:00:00.000Z" },
    });
    receiptsMock.mockReturnValue({ receipts: [RECEIPT] });
    receiptDetailApiMock.mockResolvedValue(detail([groceryItem(1)]));
    claimMock.mockResolvedValue([1]);
    const lines = [
      {
        pantryId: "p1",
        itemName: "Хліб",
        addedQty: 1,
        unit: "шт",
        isNewPosition: true,
        source: null,
      },
    ];
    const upsertItemForAutoImport = vi
      .fn<(items: PantryItem[]) => PantryReplenishLine[]>()
      .mockReturnValue(lines);
    const revertReplenish = vi.fn<(lines: PantryReplenishLine[]) => void>();

    renderAutoImport({ upsertItemForAutoImport, revertReplenish });

    await waitFor(() => expect(toastShowMock).toHaveBeenCalled());
    const action = toastShowMock.mock.calls[0]![3] as { onClick: () => void };
    act(() => action.onClick());

    expect(revertReplenish).toHaveBeenCalledTimes(1);
    expect(revertReplenish).toHaveBeenCalledWith(lines);
    expect(releaseMock).toHaveBeenCalledWith("rcpt-1", [1], true);
  });
});
