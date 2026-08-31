// @vitest-environment jsdom
/**
 * `SilpoPantryReplenishEntry` — entry point gating + end-to-end confirm
 * flow through the real `SilpoPantryReplenishSheet`. Data hooks
 * (`useSilpoSyncState`, `useSilpoReceipts`, `useSilpoReceiptDetail`) are
 * mocked at the `@finyk/hooks/*` boundary — this test is about the
 * nutrition-side wiring (visibility gate, default checkboxes, "нічого не
 * пишеться мовчки"), not about the finyk hooks themselves (covered by
 * their own suites).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SilpoReceiptDetailDto } from "@shared/api";

const syncStateMock = vi.fn();
const receiptsMock = vi.fn();
const receiptDetailMock = vi.fn();

vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: (...args: unknown[]) => syncStateMock(...args),
}));
vi.mock("@finyk/hooks/useSilpoReceipts", () => ({
  useSilpoReceipts: (...args: unknown[]) => receiptsMock(...args),
  useSilpoReceiptDetail: (...args: unknown[]) => receiptDetailMock(...args),
}));

import { SilpoPantryReplenishEntry } from "./SilpoPantryReplenishEntry";

const RECEIPT_SUMMARY = {
  receiptId: "rcpt-1",
  purchasedAt: "2026-08-17T10:00:00.000Z",
  storeId: "store-1",
  channel: "offline" as const,
  paymentHint: "card",
  totalKop: 100000,
  transactionId: null,
};

function detail(items: SilpoReceiptDetailDto["items"]): SilpoReceiptDetailDto {
  return { ...RECEIPT_SUMMARY, items };
}

afterEach(() => cleanup());

describe("SilpoPantryReplenishEntry", () => {
  beforeEach(() => {
    syncStateMock.mockReset();
    receiptsMock.mockReset();
    receiptDetailMock.mockReset();
    receiptsMock.mockReturnValue({
      receipts: [RECEIPT_SUMMARY],
      isLoading: false,
    });
    receiptDetailMock.mockReturnValue({
      data: detail([
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
      isLoading: false,
    });
  });

  it("renders nothing when Silpo isn't connected", () => {
    syncStateMock.mockReturnValue({ status: "disconnected" });
    render(
      <SilpoPantryReplenishEntry
        pantryItems={[]}
        upsertItem={vi.fn()}
        busy={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /З покупок Сільпо/i }),
    ).toBeNull();
  });

  it("renders nothing when the integration is disabled/unknown", () => {
    syncStateMock.mockReturnValue({ status: "disabled" });
    render(
      <SilpoPantryReplenishEntry
        pantryItems={[]}
        upsertItem={vi.fn()}
        busy={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /З покупок Сільпо/i }),
    ).toBeNull();
  });

  it("shows the entry CTA when connected, opens the sheet with default checkboxes, and confirm() writes only checked items", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    const upsertItem = vi.fn();
    const user = userEvent.setup();

    render(
      <SilpoPantryReplenishEntry
        pantryItems={[]}
        upsertItem={upsertItem}
        busy={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /З покупок Сільпо/i }));

    // "Хліб" — groceries default → checked; "Пральний порошок" — shopping
    // default → unchecked (spec § Рішення дизайну: "побутова хімія —
    // вимкнена").
    const breadCheckbox = screen.getByRole("checkbox", { name: /Хліб/i });
    const detergentCheckbox = screen.getByRole("checkbox", {
      name: /Пральний порошок/i,
    });
    expect(breadCheckbox).toBeChecked();
    expect(detergentCheckbox).not.toBeChecked();

    const confirmButton = screen.getByRole("button", {
      name: /Додати в комору/i,
    });
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(upsertItem).toHaveBeenCalledTimes(1);
    expect(upsertItem).toHaveBeenCalledWith([
      {
        name: "Хліб",
        qty: 1,
        unit: "шт",
        notes: null,
        sources: [
          {
            name: "Хліб",
            qty: 1,
            unit: "шт",
            addedAt: expect.any(String) as unknown as string,
            // Одна штука — множення фасування не відбувалось, тож «× N»
            // у розкладі позиції показувати нема чого.
            packCount: null,
          },
        ],
      },
    ]);
  });

  it("shows the privacy reminder next to receipt items (gate #2)", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    const user = userEvent.setup();

    render(
      <SilpoPantryReplenishEntry
        pantryItems={[]}
        upsertItem={vi.fn()}
        busy={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /З покупок Сільпо/i }));

    expect(
      await screen.findByText(
        "Позиції з чека лишаються у твоїй базі, в аналітику вони не йдуть.",
      ),
    ).toBeInTheDocument();
  });

  it("disables the confirm CTA when nothing is checked", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    receiptDetailMock.mockReturnValue({
      data: detail([
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
      isLoading: false,
    });
    const user = userEvent.setup();

    render(
      <SilpoPantryReplenishEntry
        pantryItems={[]}
        upsertItem={vi.fn()}
        busy={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /З покупок Сільпо/i }));

    const confirmButton = screen.getByRole("button", {
      name: /Додати в комору/i,
    });
    expect(confirmButton).toBeDisabled();
  });

  it("shows an existing pantry match label instead of 'нова позиція' when norm-key matches", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    receiptDetailMock.mockReturnValue({
      data: detail([
        {
          id: 1,
          name: "молоко",
          qty: 1,
          unit: "л",
          priceKop: 4500,
          categorySlug: null,
          barcode: null,
        },
      ]),
      isLoading: false,
    });
    const user = userEvent.setup();

    render(
      <SilpoPantryReplenishEntry
        pantryItems={[{ name: "Молоко" }]}
        upsertItem={vi.fn()}
        busy={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /З покупок Сільпо/i }));

    expect(screen.getByText(/Уже є: Молоко/i)).toBeTruthy();
    expect(screen.queryByText(/Нова позиція/i)).toBeNull();
  });
});
