// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn(),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
      unlinkReceipt: vi.fn(),
      relinkReceipt: vi.fn(),
    },
  };
});

import { ApiError } from "@sergeant/api-client";
import { silpoApi } from "@shared/api";
import { SilpoReceiptSection } from "./SilpoReceiptSection";

const mockedSyncState = silpoApi.syncState as unknown as ReturnType<
  typeof vi.fn
>;
const mockedReceipts = silpoApi.receipts as unknown as ReturnType<typeof vi.fn>;
const mockedReceiptDetail = silpoApi.receiptDetail as unknown as ReturnType<
  typeof vi.fn
>;
const mockedUnlink = silpoApi.unlinkReceipt as unknown as ReturnType<
  typeof vi.fn
>;
const mockedRelink = silpoApi.relinkReceipt as unknown as ReturnType<
  typeof vi.fn
>;

const RECEIPT_SUMMARY = {
  receiptId: "r1",
  purchasedAt: "2026-08-10T10:00:00.000Z",
  storeId: null,
  channel: "offline" as const,
  paymentHint: null,
  totalKop: 39_000,
  transactionId: "bank-1",
};

/** Same fixture amounts as `receiptSplitSuggestion.test.ts` (domain suite)
 * — `shopping` 20 000, `groceries` 14 000 (Хліб+Сир), `health` 5 000, no
 * remainder against `totalKop`. */
const MULTI_CATEGORY_ITEMS = [
  {
    id: 1,
    name: "Хліб",
    qty: 1,
    unit: null,
    priceKop: 2_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 2,
    name: "Сир",
    qty: 1,
    unit: null,
    priceKop: 12_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 3,
    name: "Пральний порошок Persil",
    qty: 1,
    unit: null,
    priceKop: 20_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 4,
    name: "Зубна паста Sensodyne",
    qty: 1,
    unit: null,
    priceKop: 5_000,
    categorySlug: null,
    barcode: null,
  },
];

const SINGLE_CATEGORY_ITEMS = [
  {
    id: 1,
    name: "Хліб",
    qty: 1,
    unit: null,
    priceKop: 1_000,
    categorySlug: null,
    barcode: null,
  },
  {
    id: 2,
    name: "Яйця",
    qty: 1,
    unit: null,
    priceKop: 2_000,
    categorySlug: null,
    barcode: null,
  },
];

function renderSection(
  overrides: Partial<Parameters<typeof SilpoReceiptSection>[0]> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onSplitChange = vi.fn();
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SilpoReceiptSection
          transactionId="bank-1"
          transactionAmountKop={39_000}
          onSplitChange={onSplitChange}
          {...overrides}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, client, onSplitChange };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SilpoReceiptSection", () => {
  it("renders nothing when Silpo isn't connected and never requests receipts", async () => {
    mockedSyncState.mockResolvedValue({
      status: "disconnected",
      accessTokenExpiresAt: null,
      lastSyncAt: null,
      receiptsCount: 0,
    });
    const { container, client } = renderSection();
    // Первинний рендер — теж `null`, тож синхронний assert проходив би
    // незалежно від статусу. Чекаємо, поки запит статусу реально
    // відпрацює й усі запити устаканяться.
    await waitFor(() => expect(mockedSyncState).toHaveBeenCalled());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(container).toBeEmptyDOMElement();
    expect(mockedReceipts).not.toHaveBeenCalled();
  });

  it("proposes a multi-category split from receipt items and confirms it via onSplitChange", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [RECEIPT_SUMMARY],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...RECEIPT_SUMMARY,
      items: MULTI_CATEGORY_ITEMS,
    });

    const { onSplitChange } = renderSection();

    const splitCta = await screen.findByRole("button", {
      name: /Розбити за чеком/,
    });
    expect(splitCta).toBeEnabled();
    fireEvent.click(splitCta);

    // Category chips resolved through `resolveExpenseCategoryMeta` after
    // canonicalization: "groceries" → "food" ("Продукти"), plus "health"
    // ("Здоровʼя") and "shopping" ("Покупки").
    expect(await screen.findByText("Продукти")).toBeInTheDocument();
    expect(screen.getByText("Здоровʼя")).toBeInTheDocument();
    expect(screen.getByText("Покупки")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Підтвердити спліт" }));

    expect(onSplitChange).toHaveBeenCalledTimes(1);
    const [txId, splits] = onSplitChange.mock.calls[0] as [
      string,
      Array<{ categoryId: string; amount: number }>,
    ];
    expect(txId).toBe("bank-1");
    expect(splits).toEqual(
      expect.arrayContaining([
        { categoryId: "shopping", amount: 200 },
        { categoryId: "food", amount: 140 },
        { categoryId: "health", amount: 50 },
      ]),
    );
    expect(splits).toHaveLength(3);
  });

  it("warns before overwriting an existing manual split", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [RECEIPT_SUMMARY],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...RECEIPT_SUMMARY,
      items: MULTI_CATEGORY_ITEMS,
    });

    renderSection({ existingSplitsCount: 2 });

    fireEvent.click(
      await screen.findByRole("button", { name: /Розбити за чеком/ }),
    );

    expect(
      screen.getByText(
        "У транзакції вже є ручний спліт, підтвердження замінить його.",
      ),
    ).toBeInTheDocument();
  });

  it("disables the split CTA and shows a caption when every item lands in one category", async () => {
    // Summary і detail описують ОДИН і той самий чек (однаковий
    // `totalKop`) — розбіжність тут була б артефактом фікстури, а не
    // сценарієм.
    const singleCategorySummary = { ...RECEIPT_SUMMARY, totalKop: 3_000 };
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [singleCategorySummary],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...singleCategorySummary,
      items: SINGLE_CATEGORY_ITEMS,
    });

    renderSection({ transactionAmountKop: 3_000 });

    const splitCta = await screen.findByRole("button", {
      name: /Розбити за чеком/,
    });
    expect(splitCta).toBeDisabled();
    expect(
      screen.getByText("Усе – продукти, спліт не потрібен."),
    ).toBeInTheDocument();
  });

  it("sums the splits to the TRANSACTION amount when it differs from the receipt total", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [RECEIPT_SUMMARY],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...RECEIPT_SUMMARY,
      items: MULTI_CATEGORY_ITEMS,
    });

    // Чек — 39 000 коп., але з картки реально списалось 40 000 коп.
    // (matcher лінкує за `receipt_id`, суми можуть розійтись). Авторитет —
    // транзакція: недобір 1 000 коп. падає у «Продукти».
    const { onSplitChange } = renderSection({ transactionAmountKop: 40_000 });

    fireEvent.click(
      await screen.findByRole("button", { name: /Розбити за чеком/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Підтвердити спліт" }));

    expect(onSplitChange).toHaveBeenCalledTimes(1);
    const [, splits] = onSplitChange.mock.calls[0] as [
      string,
      Array<{ categoryId: string; amount: number }>,
    ];
    expect(splits).toEqual(
      expect.arrayContaining([
        { categoryId: "shopping", amount: 200 },
        { categoryId: "food", amount: 150 },
        { categoryId: "health", amount: 50 },
      ]),
    );
    const totalUah = splits.reduce((sum, s) => sum + s.amount, 0);
    expect(totalUah).toBe(400);
  });

  it("scales the buckets down (nothing dropped) when receipt items exceed the transaction amount", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    mockedReceipts.mockResolvedValue({
      data: [RECEIPT_SUMMARY],
      nextCursor: null,
    });
    mockedReceiptDetail.mockResolvedValue({
      ...RECEIPT_SUMMARY,
      items: MULTI_CATEGORY_ITEMS,
    });

    // Позиції чека (39 000 коп.) > списання (19 500 коп.) — знижка «на
    // касі». Раніше відʼємний remainder зʼїдав food-бакет і сума сплітів
    // перевищувала total; тепер бакети пропорційно масштабуються.
    const { onSplitChange } = renderSection({ transactionAmountKop: 19_500 });

    fireEvent.click(
      await screen.findByRole("button", { name: /Розбити за чеком/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Підтвердити спліт" }));

    expect(onSplitChange).toHaveBeenCalledTimes(1);
    const [, splits] = onSplitChange.mock.calls[0] as [
      string,
      Array<{ categoryId: string; amount: number }>,
    ];
    // Жодну категорію не викинуто, кожна частка додатна…
    expect(splits.map((s) => s.categoryId).sort()).toEqual([
      "food",
      "health",
      "shopping",
    ]);
    for (const split of splits) expect(split.amount).toBeGreaterThan(0);
    // …і сума РІВНО дорівнює сумі транзакції.
    const totalUah = splits.reduce((sum, s) => sum + s.amount, 0);
    expect(totalUah).toBe(195);
  });

  it("keeps the CTA disabled and never calls onSplitChange when reconciliation leaves fewer than 2 splits", async () => {
    mockedSyncState.mockResolvedValue({
      status: "connected",
      accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
      lastSyncAt: "2026-08-18T09:00:00.000Z",
      receiptsCount: 1,
    });
    const tinySummary = { ...RECEIPT_SUMMARY, totalKop: 20_010 };
    mockedReceipts.mockResolvedValue({
      data: [tinySummary],
      nextCursor: null,
    });
    // Дві категорії (`singleCategory === false`), але транзакція на 30
    // коп.: після масштабування groceries-бакет (10 коп.) падає в 0 і
    // відфільтровується — лишається ОДНА частка. Старий гейт
    // (`!suggestion.singleCategory`) вмикав CTA, а `confirmSplit`
    // передавав `null` = «видалити ручний спліт користувача».
    mockedReceiptDetail.mockResolvedValue({
      ...tinySummary,
      items: [
        {
          id: 1,
          name: "Хліб",
          qty: 1,
          unit: null,
          priceKop: 10,
          categorySlug: null,
          barcode: null,
        },
        {
          id: 2,
          name: "Пральний порошок Persil",
          qty: 1,
          unit: null,
          priceKop: 20_000,
          categorySlug: null,
          barcode: null,
        },
      ],
    });

    const { onSplitChange } = renderSection({
      transactionAmountKop: 30,
      existingSplitsCount: 2,
    });

    const splitCta = await screen.findByRole("button", {
      name: /Розбити за чеком/,
    });
    expect(splitCta).toBeDisabled();
    fireEvent.click(splitCta);
    expect(
      screen.queryByRole("button", { name: "Підтвердити спліт" }),
    ).not.toBeInTheDocument();
    expect(onSplitChange).not.toHaveBeenCalled();
  });

  describe("«Це не той чек» — розлінк хибної пари", () => {
    async function renderConnectedWithReceipt() {
      mockedSyncState.mockResolvedValue({
        status: "connected",
        accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
        lastSyncAt: "2026-08-18T09:00:00.000Z",
        receiptsCount: 1,
      });
      mockedReceipts.mockResolvedValue({
        data: [RECEIPT_SUMMARY],
        nextCursor: null,
      });
      mockedReceiptDetail.mockResolvedValue({
        ...RECEIPT_SUMMARY,
        items: [
          {
            id: 1,
            name: "Молоко",
            qty: 1,
            unit: "шт",
            priceKop: 39_000,
            categorySlug: null,
            barcode: null,
          },
        ],
      });
      const utils = renderSection();
      await screen.findByText("Чек із Сільпо");
      return utils;
    }

    it("шле id транзакції на сервер", async () => {
      mockedUnlink.mockResolvedValue({ ok: true, receiptId: "r1" });
      await renderConnectedWithReceipt();

      fireEvent.click(screen.getByRole("button", { name: "Це не той чек" }));

      await waitFor(() => expect(mockedUnlink).toHaveBeenCalledWith("bank-1"));
    });

    it("не ламає секцію, коли сервер відмовив", async () => {
      // Наприклад 404 — звʼязок уже зняли з іншої вкладки. Кнопка має
      // лишитись живою, а не залипнути в «Відвʼязую…».
      mockedUnlink.mockRejectedValue(new Error("nope"));
      await renderConnectedWithReceipt();

      fireEvent.click(screen.getByRole("button", { name: "Це не той чек" }));

      await waitFor(() => expect(mockedUnlink).toHaveBeenCalled());
      expect(
        await screen.findByRole("button", { name: "Це не той чек" }),
      ).toBeEnabled();
    });

    it("після відчеплення пропонує «Повернути» і ставить пару назад", async () => {
      // Головне тут — що афорданс переживає зникнення чека: після
      // інвалідації `summary` порожній, і без локального стану секція
      // просто зникла б разом із можливістю скасувати.
      mockedUnlink.mockResolvedValue({ ok: true, receiptId: "r1" });
      mockedRelink.mockResolvedValue({ ok: true });
      await renderConnectedWithReceipt();
      // Після інвалідації сервер уже не віддасть цей чек для транзакції —
      // саме той стан, у якому афорданс має вижити.
      mockedReceipts.mockResolvedValue({ data: [], nextCursor: null });

      fireEvent.click(screen.getByRole("button", { name: "Це не той чек" }));
      await waitFor(() => expect(mockedUnlink).toHaveBeenCalled());

      const undo = await screen.findByRole("button", { name: "Повернути" });
      fireEvent.click(undo);

      await waitFor(() =>
        expect(mockedRelink).toHaveBeenCalledWith("bank-1", "r1"),
      );
    });
  });

  describe("«Прикріпити чек» — ручне привʼязування", () => {
    async function renderConnectedWithoutReceipt() {
      mockedSyncState.mockResolvedValue({
        status: "connected",
        accessTokenExpiresAt: "2026-08-26T10:00:00.000Z",
        lastSyncAt: "2026-08-25T09:00:00.000Z",
        receiptsCount: 3,
      });
      // Немає чека для цієї транзакції, але є два без пари — рівно стан,
      // у якому matcher чесно здався.
      mockedReceipts.mockImplementation((params?: { transactionId?: string }) =>
        Promise.resolve(
          params?.transactionId
            ? { data: [], nextCursor: null }
            : {
                data: [
                  {
                    ...RECEIPT_SUMMARY,
                    receiptId: "far",
                    totalKop: 11_100,
                    purchasedAt: "2026-07-01T10:00:00.000Z",
                    transactionId: null,
                  },
                  {
                    ...RECEIPT_SUMMARY,
                    receiptId: "near",
                    totalKop: 39_000,
                    purchasedAt: "2026-08-21T10:00:00.000Z",
                    transactionId: null,
                  },
                ],
                nextCursor: null,
              },
        ),
      );
      return renderSection({
        transactionDescription: "Сільпо",
        transactionDateIso: "2026-08-21T13:07:00.000Z",
      });
    }

    it("не показує CTA на операції, що не схожа на Сільпо", async () => {
      // Інакше «Прикріпити чек» висіло б у деталях кожної витрати.
      mockedSyncState.mockResolvedValue({
        status: "connected",
        accessTokenExpiresAt: null,
        lastSyncAt: null,
        receiptsCount: 3,
      });
      mockedReceipts.mockResolvedValue({ data: [], nextCursor: null });
      renderSection({ transactionDescription: "АЗС WOG" });

      await waitFor(() => expect(mockedSyncState).toHaveBeenCalled());
      expect(
        screen.queryByRole("button", { name: "Прикріпити чек" }),
      ).not.toBeInTheDocument();
    });

    it("привʼязує обраний чек до операції", async () => {
      mockedRelink.mockResolvedValue({ ok: true });
      await renderConnectedWithoutReceipt();

      fireEvent.click(
        await screen.findByRole("button", { name: "Прикріпити чек" }),
      );

      // Найближчий за датою — зверху, і в нього ж збігається сума.
      const options = await screen.findAllByText(/сума збігається/);
      expect(options.length).toBe(1);
      fireEvent.click(options[0]!.closest("button")!);

      await waitFor(() =>
        expect(mockedRelink).toHaveBeenCalledWith("bank-1", "near"),
      );
    });
  });

  describe("discoverability CTA for not-yet-connected users", () => {
    it("shows a connect banner when not connected and the description looks like Сільпо", async () => {
      mockedSyncState.mockResolvedValue({
        status: "disconnected",
        accessTokenExpiresAt: null,
        lastSyncAt: null,
        receiptsCount: 0,
      });
      renderSection({ transactionDescription: "СІЛЬПО №42" });

      expect(
        await screen.findByRole("button", { name: /Звʼязати Сільпо/ }),
      ).toBeInTheDocument();
      expect(mockedReceipts).not.toHaveBeenCalled();
    });

    it("renders nothing when not connected and the description doesn't match Сільпо", async () => {
      mockedSyncState.mockResolvedValue({
        status: "disconnected",
        accessTokenExpiresAt: null,
        lastSyncAt: null,
        receiptsCount: 0,
      });
      const { container, client } = renderSection({
        transactionDescription: "АТБ маркет",
      });

      await waitFor(() => expect(mockedSyncState).toHaveBeenCalled());
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(container).toBeEmptyDOMElement();
    });

    it("renders the normal receipt section (not the banner) once connected", async () => {
      mockedSyncState.mockResolvedValue({
        status: "connected",
        accessTokenExpiresAt: "2026-08-24T10:00:00.000Z",
        lastSyncAt: "2026-08-18T09:00:00.000Z",
        receiptsCount: 1,
      });
      mockedReceipts.mockResolvedValue({
        data: [RECEIPT_SUMMARY],
        nextCursor: null,
      });
      mockedReceiptDetail.mockResolvedValue({
        ...RECEIPT_SUMMARY,
        items: MULTI_CATEGORY_ITEMS,
      });

      renderSection({ transactionDescription: "SILPO 123" });

      expect(
        await screen.findByRole("button", { name: /Розбити за чеком/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Звʼязати Сільпо/ }),
      ).not.toBeInTheDocument();
    });

    it("мовчить, коли інтеграція вимкнена на сервері (503 SILPO_DISABLED)", async () => {
      // Регресія: `SILPO_ENABLED=false` — дефолт і поточний стан проду.
      // Умова «будь-що крім connected» показала б цей банер геть усім, а
      // кнопка вела б у налаштування, де написано «Інтеграція ще не
      // увімкнена». Звʼязати в цьому стані НЕМОЖЛИВО — отже й кликати нема куди.
      mockedSyncState.mockRejectedValue(
        new ApiError({
          kind: "http",
          message: "disabled",
          status: 503,
          body: { code: "SILPO_DISABLED" },
          url: "/api/silpo/sync-state",
        }),
      );
      const { container, client } = renderSection({
        transactionDescription: "СІЛЬПО №42",
      });

      await waitFor(() => expect(mockedSyncState).toHaveBeenCalled());
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(container).toBeEmptyDOMElement();
    });
  });
});
