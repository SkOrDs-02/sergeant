// @vitest-environment jsdom
/**
 * Status: Active
 *
 * Покриває саме гілку очищення кошика (`cartClear`) — решта хука
 * (preview / apply / степер) лишається без юнітів, як і була.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cartPreview: vi.fn(),
  cartClear: vi.fn(),
}));

vi.mock("@shared/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  silpoApi: { cartPreview: mocks.cartPreview, cartClear: mocks.cartClear },
}));

import { useSilpoCart } from "./useSilpoCart";

const EMPTY_CART = { items: [], totalKop: 0, cartUrl: null };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSilpoCart — clear", () => {
  it("calls cartClear and exposes the emptied cart", async () => {
    mocks.cartPreview.mockResolvedValue({ results: [] });
    mocks.cartClear.mockResolvedValue(EMPTY_CART);

    const { result } = renderHook(
      () => useSilpoCart({ enabled: true, items: [] }),
      { wrapper },
    );

    expect(result.current.clearResult).toBeNull();
    act(() => result.current.clear());

    await waitFor(() => expect(result.current.clearResult).toEqual(EMPTY_CART));
    expect(mocks.cartClear).toHaveBeenCalledTimes(1);
  });

  it("surfaces a typed error kind instead of throwing", async () => {
    mocks.cartPreview.mockResolvedValue({ results: [] });
    mocks.cartClear.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(
      () => useSilpoCart({ enabled: true, items: [] }),
      { wrapper },
    );
    act(() => result.current.clear());

    await waitFor(() => expect(result.current.clearErrorKind).toBeTruthy());
    expect(result.current.clearResult).toBeNull();
  });
});
