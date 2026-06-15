// @vitest-environment jsdom
/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Hook test (T-7) for `useBarcodeProductLookup`.
 *
 * The hook returns an imperative `lookup(code)` backed by
 * `queryClient.fetchQuery` keyed on `nutritionKeys.barcode(code)`. Tests
 * assert: a found product is returned, a 404 normalises to `null` (an
 * unknown barcode is an expected outcome, not an error), the cache line is
 * reused on a repeat scan (one network hit per code), and a real network
 * error propagates. `barcodeApi` is mocked at the `@shared/api` boundary.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    barcodeApi: { lookup: vi.fn() },
  };
});

import { barcodeApi, ApiError } from "@shared/api";
import { useBarcodeProductLookup } from "./useBarcodeProduct";

const mockedLookup = barcodeApi.lookup as unknown as ReturnType<typeof vi.fn>;

const PRODUCT = {
  name: "Молоко 2.5%",
  brand: "Простоквашино",
  kcal_100g: 52,
  protein_100g: 2.9,
  fat_100g: 2.5,
  carbs_100g: 4.7,
  servingSize: null,
  servingGrams: null,
  source: "off" as const,
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useBarcodeProductLookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the found product", async () => {
    mockedLookup.mockResolvedValueOnce({ product: PRODUCT });

    const { result } = renderHook(() => useBarcodeProductLookup(), {
      wrapper: makeWrapper(),
    });

    const product = await result.current("4820000000001");
    expect(product?.name).toBe("Молоко 2.5%");
    expect(mockedLookup).toHaveBeenCalledWith("4820000000001");
  });

  it("normalises a 404 to null (unknown barcode is not an error)", async () => {
    mockedLookup.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        message: "not found",
        status: 404,
        url: "/api/barcode",
      }),
    );

    const { result } = renderHook(() => useBarcodeProductLookup(), {
      wrapper: makeWrapper(),
    });

    await expect(result.current("0000000000000")).resolves.toBeNull();
  });

  it("returns null for an empty code without hitting the network", async () => {
    const { result } = renderHook(() => useBarcodeProductLookup(), {
      wrapper: makeWrapper(),
    });

    await expect(result.current("   ")).resolves.toBeNull();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("reuses the cache line on a repeat scan of the same code", async () => {
    mockedLookup.mockResolvedValue({ product: PRODUCT });

    const { result } = renderHook(() => useBarcodeProductLookup(), {
      wrapper: makeWrapper(),
    });

    await result.current("4820000000001");
    await result.current("4820000000001");
    // Second scan is served from the React Query cache (staleTime 24h).
    expect(mockedLookup).toHaveBeenCalledTimes(1);
  });

  it("propagates a non-404 error", async () => {
    mockedLookup.mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        message: "boom",
        status: 500,
        url: "/api/barcode",
      }),
    );

    const { result } = renderHook(() => useBarcodeProductLookup(), {
      wrapper: makeWrapper(),
    });

    await expect(result.current("4820000000001")).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
