// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the meal-sheet `useBarcodeLookup` hook.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookupFoodByBarcodeMock = vi.fn();
const bindBarcodeToFoodMock = vi.fn();
const lookupProductMock = vi.fn();

vi.mock("../../lib/foodDb/foodDb", () => ({
  lookupFoodByBarcode: (...a: unknown[]) => lookupFoodByBarcodeMock(...a),
  bindBarcodeToFood: (...a: unknown[]) => bindBarcodeToFoodMock(...a),
}));

vi.mock("../../hooks/useBarcodeProduct", () => ({
  useBarcodeProductLookup: () => lookupProductMock,
}));

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return actual;
});

import { ApiError } from "@shared/api";
import { useBarcodeLookup } from "./useBarcodeLookup";

function setup(pickedFood: { id?: string } | null = null) {
  const setPickedFood = vi.fn();
  const setPickedGrams = vi.fn();
  const setForm = vi.fn();
  const { result } = renderHook(() =>
    useBarcodeLookup({
      pickedFood: pickedFood as never,
      setPickedFood,
      setPickedGrams,
      setForm,
    }),
  );
  return { result, setPickedFood, setPickedGrams, setForm };
}

beforeEach(() => {
  lookupFoodByBarcodeMock.mockReset();
  bindBarcodeToFoodMock.mockReset();
  lookupProductMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("handleBarcodeLookup", () => {
  it("no-ops for an empty code", async () => {
    const { result } = setup();
    await result.current.handleBarcodeLookup("  ");
    expect(lookupFoodByBarcodeMock).not.toHaveBeenCalled();
  });

  it("uses a local DB hit and picks it", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue({
      id: "food_1",
      name: "Локальний",
      defaultGrams: 120,
    });
    const { result, setPickedFood, setPickedGrams } = setup();
    await result.current.handleBarcodeLookup("4820000000001");
    expect(setPickedFood).toHaveBeenCalledWith(
      expect.objectContaining({ id: "food_1" }),
    );
    expect(setPickedGrams).toHaveBeenCalledWith("120");
  });

  it("falls back to remote lookup and fills the form", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue(null);
    lookupProductMock.mockResolvedValue({
      name: "Молоко",
      brand: "Бренд",
      kcal_100g: 52,
      protein_100g: 3,
      fat_100g: 2.5,
      carbs_100g: 5,
      servingGrams: 200,
      partial: false,
    });
    const { result, setPickedFood, setForm } = setup();
    await result.current.handleBarcodeLookup("4820000000002");
    expect(setPickedFood).toHaveBeenCalledWith(
      expect.objectContaining({ id: "barcode_4820000000002", name: "Молоко" }),
    );
    expect(setForm).toHaveBeenCalled();
  });

  it("reports a partial remote product", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue(null);
    lookupProductMock.mockResolvedValue({ name: "Снек", partial: true });
    const { result } = setup();
    await result.current.handleBarcodeLookup("4820000000003");
    // No throw; the status string path executed (covered).
    expect(lookupProductMock).toHaveBeenCalled();
  });

  it("reports product-not-found", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue(null);
    lookupProductMock.mockResolvedValue(null);
    const { result, setPickedFood } = setup();
    await result.current.handleBarcodeLookup("4820000000004");
    expect(setPickedFood).not.toHaveBeenCalled();
  });

  it("reports an incomplete remote product (no name)", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue(null);
    lookupProductMock.mockResolvedValue({ name: "" });
    const { result, setPickedFood } = setup();
    await result.current.handleBarcodeLookup("4820000000005");
    expect(setPickedFood).not.toHaveBeenCalled();
  });

  it("handles an offline ApiError from remote lookup", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue(null);
    const onLineSpy = vi
      .spyOn(navigator, "onLine", "get")
      .mockReturnValue(false);
    lookupProductMock.mockRejectedValue(
      new ApiError({ kind: "network", message: "off", url: "/api/barcode" }),
    );
    const { result, setPickedFood } = setup();
    await result.current.handleBarcodeLookup("4820000000006");
    expect(setPickedFood).not.toHaveBeenCalled();
    onLineSpy.mockRestore();
  });

  it("handles an http ApiError from remote lookup", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue(null);
    lookupProductMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "x",
        url: "/api/barcode",
        status: 500,
        body: { error: "Сервер" },
      }),
    );
    const { result, setPickedFood } = setup();
    await result.current.handleBarcodeLookup("4820000000007");
    expect(setPickedFood).not.toHaveBeenCalled();
  });

  it("handles a generic error from remote lookup", async () => {
    lookupFoodByBarcodeMock.mockResolvedValue(null);
    lookupProductMock.mockRejectedValue(new Error("weird"));
    const { result, setPickedFood } = setup();
    await result.current.handleBarcodeLookup("4820000000008");
    expect(setPickedFood).not.toHaveBeenCalled();
  });
});

describe("handleBarcodeBind", () => {
  it("rejects a malformed barcode", async () => {
    const { result } = setup({ id: "food_1" });
    await result.current.handleBarcodeBind("abc");
    expect(bindBarcodeToFoodMock).not.toHaveBeenCalled();
  });

  it("requires a picked food", async () => {
    const { result } = setup(null);
    await result.current.handleBarcodeBind("4820000000001");
    expect(bindBarcodeToFoodMock).not.toHaveBeenCalled();
  });

  it("binds the barcode to the picked food", async () => {
    bindBarcodeToFoodMock.mockResolvedValue(true);
    const { result } = setup({ id: "food_1" });
    await result.current.handleBarcodeBind("4820000000001");
    expect(bindBarcodeToFoodMock).toHaveBeenCalledWith(
      "4820000000001",
      "food_1",
    );
  });
});
