// @vitest-environment jsdom
/**
 * `SilpoCartEntry` — entry gating + end-to-end «У кошик Сільпо» flow через
 * реальний `SilpoCartSheet`/`useSilpoCart` (Silpo integration трек G,
 * спека `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * «Cart (MCP write path)»). `useSilpoSyncState` мокнутий на межі
 * `@finyk/hooks/*` (гейт-стан — не предмет цього тесту), `silpoApi` —
 * на межі `@shared/api` (той самий патерн, що `useBarcodeProductLookup.test.tsx`).
 * `useSilpoCart` ходить у справжній React Query, тож рендеримо під
 * `QueryClientProvider`.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { ShoppingList } from "@sergeant/nutrition-domain";

const syncStateMock = vi.fn();
vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: (...args: unknown[]) => syncStateMock(...args),
}));

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: { cartPreview: vi.fn(), cartApply: vi.fn() },
  };
});

import { ApiError } from "@shared/api";
import { silpoApi } from "@shared/api";
import { SilpoCartEntry } from "./SilpoCartEntry";

const cartPreviewMock = silpoApi.cartPreview as unknown as ReturnType<
  typeof vi.fn
>;
const cartApplyMock = silpoApi.cartApply as unknown as ReturnType<typeof vi.fn>;

const SHOPPING_LIST: ShoppingList = {
  categories: [
    {
      name: "Молочні продукти",
      items: [
        {
          id: "i1",
          name: "Молоко",
          quantity: "1 л",
          note: "",
          checked: false,
        },
        {
          id: "i2",
          name: "Стільниковий мед",
          quantity: "",
          note: "",
          checked: false,
        },
        {
          id: "i3",
          name: "Сир",
          quantity: "",
          note: "",
          checked: true, // вже позначено купленим — не йде в кошик
        },
      ],
    },
  ],
};

const MATCHED_TOP = {
  lagerId: "lager-1",
  name: "Молоко Яготинське 2.5% 900г",
  priceKop: 4500,
  oldPriceKop: null,
  // Наявність тепер вирішує, чи рядок відмічений за замовчуванням
  // (`useSilpoCart` seed) — без неї фікстура описувала б товар, якого
  // немає у філії, і жоден рядок не був би відмічений.
  available: true,
  unit: "шт",
  displayRatio: null,
};
const MATCHED_ALT = {
  lagerId: "lager-2",
  name: "Молоко Простоквашино 3.2% 900г",
  priceKop: 5200,
  oldPriceKop: null,
  available: true,
  unit: "шт",
  displayRatio: null,
};

function previewResponse() {
  return {
    results: [
      {
        query: "Молоко",
        matches: [MATCHED_TOP, MATCHED_ALT],
        unmatched: false,
      },
      { query: "Стільниковий мед", matches: [], unmatched: true },
    ],
  };
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("SilpoCartEntry", () => {
  beforeEach(() => {
    syncStateMock.mockReset();
    cartPreviewMock.mockReset();
    cartApplyMock.mockReset();
  });

  it("renders nothing when Silpo isn't connected", () => {
    syncStateMock.mockReturnValue({ status: "disconnected" });
    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    expect(
      screen.queryByRole("button", { name: /У кошик Сільпо/i }),
    ).toBeNull();
  });

  it("renders nothing when connected but there are no unchecked items", () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    const allChecked: ShoppingList = {
      categories: [
        {
          name: "Овочі",
          items: [
            { id: "i1", name: "Морква", quantity: "", note: "", checked: true },
          ],
        },
      ],
    };
    renderWithClient(<SilpoCartEntry shoppingList={allChecked} />);
    expect(
      screen.queryByRole("button", { name: /У кошик Сільпо/i }),
    ).toBeNull();
  });

  it("shows matched top pick and an honest 'unmatched' block, and lets the user pick an alternative", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    cartPreviewMock.mockResolvedValue(previewResponse());
    const user = userEvent.setup();

    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    await user.click(screen.getByRole("button", { name: /У кошик Сільпо/i }));

    expect(cartPreviewMock).toHaveBeenCalledWith(
      [{ name: "Молоко" }, { name: "Стільниковий мед" }],
      expect.anything(),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Молоко Яготинське/i }),
      ).toBeChecked(),
    );
    // Unmatched — чесний блок, не приховано, і без чекбокса.
    expect(screen.getByText("Не знайшлось у Сільпо")).toBeInTheDocument();
    expect(screen.getByText("Стільниковий мед")).toBeInTheDocument();

    const picker = screen.getByRole("combobox");
    await user.selectOptions(picker, "lager-2");
    expect(
      screen.getByRole("checkbox", { name: /Простоквашино/i }),
    ).toBeChecked();
  });

  it("shows the privacy reminder once matched rows are loaded (gate #2)", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    cartPreviewMock.mockResolvedValue(previewResponse());
    const user = userEvent.setup();

    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    await user.click(screen.getByRole("button", { name: /У кошик Сільпо/i }));

    expect(
      await screen.findByText("У Сільпо піде лише те, що ти підтвердиш нижче."),
    ).toBeInTheDocument();
  });

  it("the quantity stepper changes the row's quantity", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    cartPreviewMock.mockResolvedValue(previewResponse());
    const user = userEvent.setup();

    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    await user.click(screen.getByRole("button", { name: /У кошик Сільпо/i }));
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: /Збільшити кількість/i }),
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("apply() is called only after the confirm tap, and only sends checked rows", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    cartPreviewMock.mockResolvedValue(previewResponse());
    cartApplyMock.mockResolvedValue({
      items: [
        {
          name: "Молоко Яготинське 2.5% 900г",
          quantity: 1,
          priceKop: 4500,
          subtotalKop: 4500,
        },
      ],
      totalKop: 4500,
      cartUrl: "https://silpo.ua/cart",
    });
    const user = userEvent.setup();

    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    await user.click(screen.getByRole("button", { name: /У кошик Сільпо/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Молоко Яготинське/i }),
      ).toBeInTheDocument(),
    );

    // До кліку — жодного виклику apply.
    expect(cartApplyMock).not.toHaveBeenCalled();

    const confirmButton = screen.getByRole("button", {
      name: /Додати в кошик Сільпо/i,
    });
    await user.click(confirmButton);

    await waitFor(() => expect(cartApplyMock).toHaveBeenCalledTimes(1));
    // "Стільниковий мед" unmatched — не могло потрапити в selections.
    expect(cartApplyMock).toHaveBeenCalledWith([
      { lagerId: "lager-1", quantity: 1 },
    ]);

    // Success stage: список доданого + total + посилання на кошик.
    await waitFor(() =>
      expect(screen.getByText("Додано в кошик Сільпо")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: /Відкрити кошик у Сільпо/i }),
    ).toHaveAttribute("href", "https://silpo.ua/cart");
  });

  it("success stage without cartUrl renders no cart link", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    cartPreviewMock.mockResolvedValue(previewResponse());
    cartApplyMock.mockResolvedValue({
      items: [],
      totalKop: null,
      cartUrl: null,
    });
    const user = userEvent.setup();

    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    await user.click(screen.getByRole("button", { name: /У кошик Сільпо/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Молоко Яготинське/i }),
      ).toBeInTheDocument(),
    );
    await user.click(
      screen.getByRole("button", { name: /Додати в кошик Сільпо/i }),
    );

    await waitFor(() =>
      expect(screen.getByText("Додано в кошик Сільпо")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: /Відкрити кошик у Сільпо/i }),
    ).toBeNull();
  });

  it("shows the not-connected banner (no retry button) on a 409 SILPO_NOT_CONNECTED preview error", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    cartPreviewMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        message: "not connected",
        status: 409,
        body: { code: "SILPO_NOT_CONNECTED" },
        url: "/api/silpo/cart/preview",
      }),
    );
    const user = userEvent.setup();

    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    await user.click(screen.getByRole("button", { name: /У кошик Сільпо/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Сільпо не звʼязано/i,
      ),
    );
    expect(
      screen.queryByRole("button", { name: /Спробувати ще раз/i }),
    ).toBeNull();
  });

  it("shows a retryable 'unavailable' banner on a 502 SILPO_UPSTREAM_ERROR preview error, and retry re-fetches", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    cartPreviewMock
      .mockRejectedValueOnce(
        new ApiError({
          kind: "http",
          message: "upstream",
          status: 502,
          body: { code: "SILPO_UPSTREAM_ERROR" },
          url: "/api/silpo/cart/preview",
        }),
      )
      .mockResolvedValueOnce(previewResponse());
    const user = userEvent.setup();

    renderWithClient(<SilpoCartEntry shoppingList={SHOPPING_LIST} />);
    await user.click(screen.getByRole("button", { name: /У кошик Сільпо/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Сільпо зараз недоступне/i,
      ),
    );
    await user.click(
      screen.getByRole("button", { name: /Спробувати ще раз/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Молоко Яготинське/i }),
      ).toBeInTheDocument(),
    );
    expect(cartPreviewMock).toHaveBeenCalledTimes(2);
  });
});
