// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `usePantryBarcodeScan` — barcode → pantry-item flow.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("./useBarcodeProduct", () => ({
  useBarcodeProductLookup: () => lookupMock,
}));

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return actual;
});

import { ApiError } from "@shared/api";
import { usePantryBarcodeScan } from "./usePantryBarcodeScan";

function setup() {
  const upsertItem = vi.fn();
  const setPantryScannerOpen = vi.fn();
  const setPantryScanStatus = vi.fn();
  const { result } = renderHook(() =>
    usePantryBarcodeScan({
      pantry: { upsertItem },
      setPantryScannerOpen,
      setPantryScanStatus,
    }),
  );
  return {
    scan: result.current.scan,
    getResult: () => result.current,
    upsertItem,
    setPantryScannerOpen,
    setPantryScanStatus,
  };
}

beforeEach(() => {
  lookupMock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("usePantryBarcodeScan", () => {
  it("closes the scanner and rejects an empty code", async () => {
    const { scan, setPantryScannerOpen, setPantryScanStatus } = setup();
    await scan("---");
    expect(setPantryScannerOpen).toHaveBeenCalledWith(false);
    expect(setPantryScanStatus).toHaveBeenLastCalledWith(
      "Некоректний штрих-код.",
    );
  });

  it("adds the found product as a pantry item", async () => {
    lookupMock.mockResolvedValue({
      name: "Молоко",
      brand: "Бренд",
      partial: false,
    });
    const { scan, upsertItem, setPantryScanStatus } = setup();
    await scan("4820000000001");
    expect(upsertItem).toHaveBeenCalledWith("Молоко Бренд");
    expect(setPantryScanStatus).toHaveBeenCalledWith("Додано: Молоко Бренд");
  });

  it("flags a partial product (no КБЖВ)", async () => {
    lookupMock.mockResolvedValue({ name: "Снек", brand: "", partial: true });
    const { scan, upsertItem, setPantryScanStatus } = setup();
    await scan("4820000000002");
    expect(upsertItem).toHaveBeenCalledWith("Снек");
    expect(setPantryScanStatus).toHaveBeenCalledWith(
      expect.stringContaining("КБЖВ відсутнє"),
    );
  });

  it("reports product-not-found as a distinct not-found notice (404, not text)", async () => {
    lookupMock.mockResolvedValue(null);
    const { scan, getResult } = setup();
    await act(async () => {
      await scan("4820000000003");
    });
    expect(getResult().notice).toEqual({
      kind: "not-found",
      code: "4820000000003",
    });
  });

  it("reports a 503 as unavailable — distinct from not-found — and retry re-scans the same code", async () => {
    lookupMock.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        message: "upstreams down",
        url: "/api/barcode",
        status: 503,
      }),
    );
    const { scan, getResult } = setup();
    await act(async () => {
      await scan("4820000000009");
    });
    expect(getResult().notice).toEqual({
      kind: "unavailable",
      code: "4820000000009",
    });

    // retry() is `scan(notice.code)` fired again — assert it re-issues the
    // lookup with the SAME code, not a fresh scan/empty code.
    act(() => {
      getResult().retry();
    });
    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(lookupMock).toHaveBeenLastCalledWith("4820000000009");
  });

  it("reports a product with a missing name", async () => {
    lookupMock.mockResolvedValue({ name: "", brand: "X" });
    const { scan, setPantryScanStatus } = setup();
    await scan("4820000000004");
    expect(setPantryScanStatus).toHaveBeenLastCalledWith(
      "Продукт знайдено, але назва відсутня. Додай вручну.",
    );
  });

  it("handles an offline ApiError", async () => {
    // `isOffline` is a getter gated on `navigator.onLine === false`.
    const onLineSpy = vi
      .spyOn(navigator, "onLine", "get")
      .mockReturnValue(false);
    lookupMock.mockRejectedValue(
      new ApiError({ kind: "network", message: "off", url: "/api/barcode" }),
    );
    const { scan, setPantryScanStatus } = setup();
    await scan("4820000000005");
    expect(setPantryScanStatus).toHaveBeenLastCalledWith(
      "Немає підключення до інтернету.",
    );
    onLineSpy.mockRestore();
  });

  it("handles an http ApiError with a server message", async () => {
    // `serverMessage` is derived from `body.error`.
    lookupMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "boom",
        url: "/api/barcode",
        status: 500,
        body: { error: "Сервер впав" },
      }),
    );
    const { scan, setPantryScanStatus } = setup();
    await scan("4820000000006");
    expect(setPantryScanStatus).toHaveBeenLastCalledWith("Сервер впав");
  });

  it("handles a generic error", async () => {
    lookupMock.mockRejectedValue(new Error("weird"));
    const { scan, setPantryScanStatus } = setup();
    await scan("4820000000007");
    expect(setPantryScanStatus).toHaveBeenLastCalledWith(
      "Помилка пошуку. Перевір зʼєднання.",
    );
  });
});
