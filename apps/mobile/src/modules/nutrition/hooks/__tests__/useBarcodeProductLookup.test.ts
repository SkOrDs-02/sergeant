import { renderHook } from "@testing-library/react-native";
import NetInfo from "@react-native-community/netinfo";
import { ApiError } from "@sergeant/api-client";

const mockFetchQuery = jest.fn();
const mockLookup = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ fetchQuery: mockFetchQuery }),
}));

jest.mock("@sergeant/api-client/react", () => ({
  apiQueryKeys: {
    barcode: {
      lookup: (code: string) => ["barcode", "lookup", code],
    },
  },
  useApiClient: () => ({
    barcode: {
      lookup: (...args: unknown[]) => mockLookup(...args),
    },
  }),
}));

import { useBarcodeProductLookup } from "../useBarcodeProductLookup";

describe("useBarcodeProductLookup", () => {
  beforeEach(() => {
    mockFetchQuery.mockReset();
    mockLookup.mockReset();
    jest.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: "wifi",
    } as never);
    mockFetchQuery.mockImplementation(async (options) => options.queryFn());
  });

  it("returns null for blank codes without touching network or query cache", async () => {
    const { result } = renderHook(() => useBarcodeProductLookup());

    await expect(result.current("   ")).resolves.toBeNull();

    expect(NetInfo.fetch).not.toHaveBeenCalled();
    expect(mockFetchQuery).not.toHaveBeenCalled();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("throws a network ApiError while offline", async () => {
    jest.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
      type: "none",
    } as never);
    const { result } = renderHook(() => useBarcodeProductLookup());

    await expect(result.current("4820000000000")).rejects.toMatchObject({
      kind: "network",
      url: "/api/barcode",
    });
    expect(mockFetchQuery).not.toHaveBeenCalled();
  });

  it("fetches via React Query using the normalized barcode", async () => {
    const product = {
      code: "4820000000000",
      name: "Кефір",
      brand: "Test",
    };
    mockLookup.mockResolvedValue({ product });
    const { result } = renderHook(() => useBarcodeProductLookup());

    await expect(result.current(" 4820000000000 ")).resolves.toBe(product);

    expect(mockFetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["barcode", "lookup", "4820000000000"],
        staleTime: 24 * 60 * 60_000,
        gcTime: 7 * 24 * 60 * 60_000,
      }),
    );
    expect(mockLookup).toHaveBeenCalledWith("4820000000000");
  });

  it("maps barcode 404 responses to null", async () => {
    mockLookup.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 404,
        message: "not found",
        url: "/api/barcode",
      }),
    );
    const { result } = renderHook(() => useBarcodeProductLookup());

    await expect(result.current("4820000000001")).resolves.toBeNull();
  });
});
