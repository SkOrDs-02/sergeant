// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

vi.mock("../../../core/observability/analytics", () => ({
  trackEvent: vi.fn(),
  ANALYTICS_EVENTS: { FINYK_TX_CATEGORIZED: "finyk_tx_categorized" },
}));

// `SilpoReceiptSection` (rendered for every non-income transaction) reads
// `useSilpoSyncState` via `@tanstack/react-query` — mock the API so this
// suite (which has nothing to do with the Silpo experiment) doesn't hit a
// real, unmocked `httpClient` fetch. Status stays "disconnected", so the
// section renders nothing and every existing assertion here is unaffected.
vi.mock("@shared/api", async () => {
  const actual =
    await vi.importActual<typeof import("@shared/api")>("@shared/api");
  return {
    ...actual,
    silpoApi: {
      syncState: vi.fn().mockResolvedValue({
        status: "disconnected",
        accessTokenExpiresAt: null,
        lastSyncAt: null,
        receiptsCount: 0,
      }),
      sync: vi.fn(),
      disconnect: vi.fn(),
      wipe: vi.fn(),
      receipts: vi.fn(),
      receiptDetail: vi.fn(),
    },
  };
});

import { BankTransactionDetailsSheet } from "./BankTransactionDetailsSheet";

const TRANSACTION: Transaction = {
  id: "bank-1",
  amount: -25000,
  date: "2026-07-28",
  categoryId: "food",
  type: "expense",
  source: "mono",
  time: Math.floor(new Date("2026-07-28T09:30:00+03:00").getTime() / 1000),
  description: "Сільпо",
  mcc: 5411,
  accountId: "account-1",
  manual: false,
  _source: "mono",
  _accountId: "account-1",
  _manual: false,
};

const INCOME_TRANSACTION: Transaction = {
  id: "bank-income-1",
  amount: 500_00,
  date: "2026-08-10",
  categoryId: "in_other",
  type: "income",
  source: "mono",
  time: Math.floor(new Date("2026-08-10T09:30:00+03:00").getTime() / 1000),
  description: "Позика від Олега",
  mcc: 0,
  accountId: "account-1",
  manual: false,
  _source: "mono",
  _accountId: "account-1",
  _manual: false,
};

function renderSheet(
  overrides: Partial<Parameters<typeof BankTransactionDetailsSheet>[0]> = {},
) {
  const handlers = {
    onCategoryChange: vi.fn(),
    onNoteChange: vi.fn(),
    onSplitChange: vi.fn(),
    onToggleHidden: vi.fn(),
    onToggleExcludedFromStats: vi.fn(),
    onAttachDebtSource: vi.fn(),
    onCreateDebtFromTransaction: vi.fn(),
    onClose: vi.fn(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    // `SilpoReceiptSection` усередині ходить у `useNavigate` (CTA «Звʼязати
    // Сільпо» на транзакціях, що виглядають як покупка в Сільпо), а хук
    // кидає без роутер-контексту — той самий патерн, що вже вимагає
    // `MemoryRouter` у тестах `FinykInsightsBlock` і `useFinykBackupSync`.
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <BankTransactionDetailsSheet
          transaction={TRANSACTION}
          accounts={[{ id: "account-1", type: "black" }]}
          hidden={false}
          excludedFromStats={false}
          txSplits={{}}
          {...handlers}
          {...overrides}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return handlers;
}

afterEach(cleanup);

describe("BankTransactionDetailsSheet", () => {
  it("shows immutable bank facts and all user-owned overlays in one dialog", () => {
    renderSheet();

    expect(
      screen.getByRole("dialog", { name: "Деталі операції" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Сільпо")).toBeInTheDocument();
    expect(screen.getByText("Чорна картка")).toBeInTheDocument();
    expect(
      screen.getByText(/Monobank · дані банку не змінюються/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: "Тип запису" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Нотатка до транзакції")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Не враховувати у статистиці/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /Приховати зі списку/ }),
    ).toBeInTheDocument();
  });

  it("wires category, note and visibility edits to transaction overlays", () => {
    const handlers = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: "Транспорт" }));
    expect(handlers.onCategoryChange).toHaveBeenCalledWith(
      "bank-1",
      "transport",
    );

    const note = screen.getByLabelText("Нотатка до транзакції");
    fireEvent.change(note, { target: { value: "Оплата за друга" } });
    fireEvent.blur(note);
    expect(handlers.onNoteChange).toHaveBeenCalledWith(
      "bank-1",
      "Оплата за друга",
    );

    fireEvent.click(
      screen.getByRole("switch", { name: /Не враховувати у статистиці/ }),
    );
    expect(handlers.onToggleExcludedFromStats).toHaveBeenCalledWith("bank-1");

    fireEvent.click(
      screen.getByRole("switch", { name: /Приховати зі списку/ }),
    );
    expect(handlers.onToggleHidden).toHaveBeenCalledWith("bank-1");
  });

  it("edits and saves a balanced category split inside the same dialog", () => {
    const handlers = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Розділити/ }));
    // `getAllByLabelText`, а не роль `spinbutton`: поля сум перейшли на
    // `type="text"` + `inputMode="decimal"`, щоб приймати кому — під
    // `type="number"` «150,50» приходило порожнім рядком і частка ставала 0.
    const amounts = screen.getAllByLabelText("Сума частки");
    fireEvent.change(amounts[0]!, { target: { value: "150" } });
    fireEvent.change(amounts[1]!, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(handlers.onSplitChange).toHaveBeenCalledWith(
      "bank-1",
      expect.arrayContaining([
        expect.objectContaining({ amount: 150 }),
        expect.objectContaining({ amount: 100 }),
      ]),
    );
  });

  it("closes from the explicit footer action", () => {
    const handlers = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("BankTransactionDetailsSheet — категорія «Борг» у надходженнях (PR-3)", () => {
  it("не показує прив'язку пасиву поза категорією «Борг»", () => {
    renderSheet({ transaction: INCOME_TRANSACTION, overrideCatId: "in_other" });
    expect(
      screen.queryByText("Це надходження - борг?"),
    ).not.toBeInTheDocument();
  });

  it("пропонує привʼязати до наявного пасиву й підставляє суму без ручного перенабору", () => {
    const handlers = renderSheet({
      transaction: INCOME_TRANSACTION,
      overrideCatId: "in_debt",
      manualDebts: [
        { id: "debt-1", name: "Позика в Олега", amount: 300, totalAmount: 300 },
      ],
    });

    expect(screen.getByText("Це надходження - борг?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Позика в Олега" }));

    expect(handlers.onAttachDebtSource).toHaveBeenCalledWith(
      "debt-1",
      "bank-income-1",
      500,
    );
  });

  it("створює новий пасив із сумою й датою транзакції без повторного набору", () => {
    const handlers = renderSheet({
      transaction: INCOME_TRANSACTION,
      overrideCatId: "in_debt",
      manualDebts: [],
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Створити новий пасив" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Створити й привʼязати" }),
    );

    expect(handlers.onCreateDebtFromTransaction).toHaveBeenCalledWith({
      name: "Позика від Олега",
      amountUAH: 500,
      dueDate: "2026-08-10",
      txId: "bank-income-1",
    });
  });

  it("транзакція, вже привʼязана до пасиву, не пропонує повторну прив'язку", () => {
    renderSheet({
      transaction: INCOME_TRANSACTION,
      overrideCatId: "in_debt",
      manualDebts: [
        {
          id: "debt-1",
          name: "Позика в Олега",
          amount: 500,
          totalAmount: 500,
          linkedTxIds: [INCOME_TRANSACTION.id],
          txLinks: { [INCOME_TRANSACTION.id]: { role: "source", amount: 500 } },
        },
      ],
    });

    expect(
      screen.getByText(/Привʼязано до пасиву.*Позика в Олега/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Створити новий пасив" }),
    ).not.toBeInTheDocument();
  });
});
