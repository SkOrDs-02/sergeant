// @vitest-environment jsdom
/**
 * Картка нових чеків Сільпо в огляді Харчування і аркуш нових чеків (спека
 * `docs/work/specs/silpo-pantry-confirm.md` § Верифікація, п. 2 «Web,
 * картка»). Справжній React Query і справжні хуки, мокається лише
 * `silpoApi`: так перевіряється й те, що після «Додати» чек зникає з картки
 * через інвалідацію, а ререндери не множать запитів чеків.
 */
import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SilpoReceiptDetailDto } from "@shared/api";

const api = vi.hoisted(() => ({
  receipts: vi.fn(),
  receiptDetail: vi.fn(),
  pantryClaim: vi.fn(),
  pantryRelease: vi.fn(),
  pantrySkips: vi.fn(),
  recordPantrySkips: vi.fn(),
}));

vi.mock("@shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/api")>();
  return { ...actual, silpoApi: { ...actual.silpoApi, ...api } };
});
vi.mock("@finyk/hooks/useSilpoSyncState", () => ({
  useSilpoSyncState: () => ({
    status: "connected",
    data: { pantryAutoImportSince: "2026-11-01T00:00:00.000Z" },
  }),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import {
  SilpoPantryOffersCard,
  offersCardTitle,
} from "./SilpoPantryOffersCard";
import { pantryProductKey } from "../lib/silpoReplenish";

type Item = SilpoReceiptDetailDto["items"][number];

function item(id: number, name: string): Item {
  return {
    id,
    name,
    qty: 1,
    unit: "шт",
    priceKop: 3000,
    categorySlug: null,
    barcode: null,
    pantryClaimedAt: null,
  };
}

function summary(receiptId: string, purchasedAt: string, claimed = 0) {
  return {
    receiptId,
    purchasedAt,
    storeId: "store-1",
    channel: "offline" as const,
    paymentHint: "card",
    totalKop: 50000,
    transactionId: null,
    pantryClaimedCount: claimed,
    pantryAutoDeclined: false,
  };
}

const FRESH = new Date(Date.now() - 86_400_000).toISOString();
const OLD = new Date(Date.now() - 9 * 86_400_000).toISOString();

/** Сервер у памʼяті: чеки, позиції і позначки бронювання. */
function serveReceipts(
  receipts: Record<string, { at: string; items: Item[] }>,
) {
  const claimed = new Map<string, number>();
  api.receipts.mockImplementation(async () => ({
    data: Object.entries(receipts).map(([id, r]) =>
      summary(id, r.at, claimed.get(id) ?? 0),
    ),
    nextCursor: null,
  }));
  api.receiptDetail.mockImplementation(async (id: string) => ({
    ...summary(id, receipts[id]!.at),
    items: receipts[id]!.items,
  }));
  api.pantryClaim.mockImplementation(
    async (id: string, body: { itemIds: number[] }) => {
      claimed.set(id, body.itemIds.length);
      return { claimedItemIds: body.itemIds };
    },
  );
}

function renderCard(upsertItem = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const ui = (
    <SilpoPantryOffersCard
      pantryItems={[]}
      upsertItem={upsertItem}
      busy={false}
    />
  );
  const view = render(ui, { wrapper });
  return { ...view, upsertItem, rerenderCard: () => view.rerender(ui) };
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.pantryRelease.mockResolvedValue({ ok: true });
  api.pantrySkips.mockResolvedValue({ productKeys: [] });
  api.recordPantrySkips.mockResolvedValue({ ok: true });
});

describe("offersCardTitle", () => {
  it("однина без числа чеків, далі з числом і відмінюванням", () => {
    expect(offersCardTitle(1, 12)).toBe("Новий чек Сільпо: 12 продуктів");
    expect(offersCardTitle(3, 27)).toBe("3 нові чеки Сільпо: 27 продуктів");
    expect(offersCardTitle(5, 1)).toBe("5 нових чеків Сільпо: 1 продукт");
  });
});

describe("SilpoPantryOffersCard", () => {
  it("є чек, що пропонується: картка з кількістю продуктів, хімія не рахується", async () => {
    serveReceipts({
      r1: {
        at: FRESH,
        items: [
          item(1, "Хліб Київхліб"),
          item(2, "Молоко Галичина 900г"),
          item(3, "Пральний порошок Persil"),
        ],
      },
    });
    renderCard();
    expect(
      await screen.findByText("Новий чек Сільпо: 2 продукти"),
    ).toBeInTheDocument();
  });

  it("чек без продуктів картки не дає", async () => {
    serveReceipts({
      r1: { at: FRESH, items: [item(3, "Пральний порошок Persil")] },
    });
    renderCard();
    await waitFor(() => expect(api.receiptDetail).toHaveBeenCalled());
    expect(
      screen.queryByTestId("silpo-pantry-offers-card"),
    ).not.toBeInTheDocument();
  });

  it("жодного запису в комору і бронювання без «Додати»", async () => {
    serveReceipts({ r1: { at: FRESH, items: [item(1, "Хліб Київхліб")] } });
    const { upsertItem } = renderCard();
    await screen.findByTestId("silpo-pantry-offers-card");
    expect(upsertItem).not.toHaveBeenCalled();
    expect(api.pantryClaim).not.toHaveBeenCalled();
  });

  it("ререндери не множать запитів чеків", async () => {
    serveReceipts({ r1: { at: FRESH, items: [item(1, "Хліб Київхліб")] } });
    const { rerenderCard } = renderCard();
    await screen.findByTestId("silpo-pantry-offers-card");
    for (let i = 0; i < 5; i++) rerenderCard();
    await act(async () => {});
    expect(api.receipts).toHaveBeenCalledTimes(1);
    expect(api.receiptDetail).toHaveBeenCalledTimes(1);
  });

  it("«Не додавати» відхиляє всі показані чеки", async () => {
    serveReceipts({
      r1: { at: FRESH, items: [item(1, "Хліб Київхліб")] },
      r2: { at: FRESH, items: [item(2, "Молоко Галичина 900г")] },
    });
    renderCard();
    fireEvent.click(
      within(await screen.findByTestId("silpo-pantry-offers-card")).getByRole(
        "button",
        { name: "Не додавати" },
      ),
    );
    await waitFor(() => expect(api.pantryRelease).toHaveBeenCalledTimes(2));
    expect(api.pantryRelease).toHaveBeenCalledWith("r1", {
      itemIds: [],
      decline: true,
    });
    expect(api.pantryRelease).toHaveBeenCalledWith("r2", {
      itemIds: [],
      decline: true,
    });
  });

  it("після «Додати» продукти в коморі, лічильники записані, чек з картки зник", async () => {
    serveReceipts({
      r1: {
        at: FRESH,
        items: [item(1, "Хліб Київхліб"), item(2, "Молоко Галичина 900г")],
      },
    });
    const { upsertItem } = renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Переглянути" }));
    // Знята дефолтна галочка з молока - це і є «зняв вручну».
    fireEvent.click(await screen.findByText("Молоко Галичина 900г"));
    fireEvent.click(screen.getByRole("button", { name: /Додати в комору/ }));

    await waitFor(() => expect(upsertItem).toHaveBeenCalledTimes(1));
    expect(api.pantryClaim).toHaveBeenCalledWith("r1", {
      itemIds: [1],
      mode: "manual",
    });
    expect(api.recordPantrySkips).toHaveBeenCalledWith({
      skipped: [pantryProductKey("Молоко Галичина 900г")],
      added: [pantryProductKey("Хліб Київхліб")],
    });
    await waitFor(() =>
      expect(
        screen.queryByTestId("silpo-pantry-offers-card"),
      ).not.toBeInTheDocument(),
    );
  });

  it("старий чек згорнутий, без галочок, з давністю; «Вже не актуальний» його прибирає", async () => {
    serveReceipts({
      r1: { at: FRESH, items: [item(1, "Хліб Київхліб")] },
      old: { at: OLD, items: [item(2, "Курка гомілка")] },
    });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Переглянути" }));
    expect(
      await screen.findByText("Куплено 9 днів тому, познач те, що ще є."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Курка гомілка")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { expanded: false });
    fireEvent.click(toggle);
    expect(await screen.findByText("Курка гомілка")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Додати в комору \(1\)/ }),
    ).toBeInTheDocument();

    const declines = screen.getAllByRole("button", {
      name: "Вже не актуальний",
    });
    fireEvent.click(declines[1]!);
    await waitFor(() =>
      expect(api.pantryRelease).toHaveBeenCalledWith("old", {
        itemIds: [],
        decline: true,
      }),
    );
    expect(screen.queryByText("Курка гомілка")).not.toBeInTheDocument();
  });

  it("продукт, який людина зазвичай не додає, без галочки з підписом", async () => {
    api.pantrySkips.mockResolvedValue({
      productKeys: [pantryProductKey("Молоко Яготинське 900г")],
    });
    serveReceipts({
      r1: {
        at: FRESH,
        items: [item(1, "Хліб Київхліб"), item(2, "Молоко Галичина 900г")],
      },
    });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Переглянути" }));
    expect(await screen.findByText("Зазвичай не додаєш")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Додати в комору \(1\)/ }),
    ).toBeInTheDocument();
  });
});
