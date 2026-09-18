// @vitest-environment jsdom
/**
 * `PantrySourceTabs` — one source strip for «Додати продукти» (owner
 * decision 2026-09-11). Covers: mode toggle wiring, scan segment gating,
 * and the «З чека» segment (Silpo gate + sheet flow), which absorbs the
 * coverage that used to live in the now-deleted
 * `SilpoPantryReplenishEntry.test.tsx`.
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

import { PantrySourceTabs } from "./PantrySourceTabs";

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

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    mode: "single" as const,
    onModeChange: vi.fn(),
    onScanBarcode: vi.fn(),
    pantryItems: [],
    upsertItem: vi.fn(),
    busy: false,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("PantrySourceTabs — mode + scan segments", () => {
  beforeEach(() => {
    syncStateMock.mockReset();
    syncStateMock.mockReturnValue({ status: "disconnected" });
  });

  it("renders exactly single/list/scan (3 columns) when Silpo isn't connected", () => {
    render(<PantrySourceTabs {...baseProps()} />);
    expect(screen.getByText("По одному")).toBeInTheDocument();
    expect(screen.getByText("Списком")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Сканувати штрих-код" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("З чека")).not.toBeInTheDocument();
  });

  it("calls onModeChange('single'/'list') on tap, without touching onScanBarcode", async () => {
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(<PantrySourceTabs {...baseProps({ onModeChange })} />);

    await user.click(screen.getByText("Списком"));
    expect(onModeChange).toHaveBeenCalledWith("list");
    await user.click(screen.getByText("По одному"));
    expect(onModeChange).toHaveBeenCalledWith("single");
  });

  it("scan segment calls onScanBarcode and does not call onModeChange", async () => {
    const onScanBarcode = vi.fn();
    const onModeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PantrySourceTabs {...baseProps({ onScanBarcode, onModeChange })} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Сканувати штрих-код" }),
    );
    expect(onScanBarcode).toHaveBeenCalledTimes(1);
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("omits the scan segment entirely (2 columns) when onScanBarcode isn't provided", () => {
    render(<PantrySourceTabs {...baseProps({ onScanBarcode: undefined })} />);
    expect(
      screen.queryByRole("button", { name: "Сканувати штрих-код" }),
    ).not.toBeInTheDocument();
  });
});

describe("PantrySourceTabs — «З чека» segment (Silpo gate)", () => {
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

  it("hides the segment when Silpo isn't connected", () => {
    syncStateMock.mockReturnValue({ status: "disconnected" });
    render(<PantrySourceTabs {...baseProps()} />);
    expect(
      screen.queryByRole("button", { name: /З покупок Сільпо/i }),
    ).toBeNull();
  });

  it("hides the segment when the integration is disabled/unknown", () => {
    syncStateMock.mockReturnValue({ status: "disabled" });
    render(<PantrySourceTabs {...baseProps()} />);
    expect(
      screen.queryByRole("button", { name: /З покупок Сільпо/i }),
    ).toBeNull();
  });

  it("shows the segment (4 columns) when connected; visible label is short, accessible name is the full CTA", () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    render(<PantrySourceTabs {...baseProps()} />);
    expect(screen.getByText("З чека")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "З покупок Сільпо" }),
    ).toBeInTheDocument();
  });

  it("opens the sheet, confirm() writes only checked items", async () => {
    syncStateMock.mockReturnValue({ status: "connected" });
    const upsertItem = vi.fn();
    const user = userEvent.setup();

    render(<PantrySourceTabs {...baseProps({ upsertItem })} />);

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
            packCount: null,
            packGrams: null,
          },
        ],
      },
    ]);
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
      <PantrySourceTabs
        {...baseProps({ pantryItems: [{ name: "Молоко" }] })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /З покупок Сільпо/i }));

    expect(screen.getByText(/Уже є: Молоко/i)).toBeTruthy();
    expect(screen.queryByText(/Нова позиція/i)).toBeNull();
  });
});
