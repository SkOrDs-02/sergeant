/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Місток «ручний запис із категорією Борг → пасив». Паритет із деталями
 * банківської операції: до цього ручна витрата, розписана на борг, ніде
 * не пропонувала привʼязку, і пасив про неї не дізнавався.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ManualExpenseSheet } from "./ManualExpenseSheet";
import type { Debt } from "@sergeant/finyk-domain/domain/debtEngine";

beforeAll(() => {
  Object.defineProperty(window.navigator, "vibrate", {
    value: vi.fn(),
    configurable: true,
  });
});

afterEach(() => cleanup());

const DEBT: Debt = {
  id: "d1",
  name: "Кредитка ПриватБанк",
  amount: 5000,
  linkedTxIds: [],
};

const savedDebtExpense = {
  id: "m1",
  description: "Платіж по картці",
  amount: 1000,
  category: "debt",
  date: "2026-09-10T12:00:00.000Z",
};

function renderSheet(
  overrides: Partial<Parameters<typeof ManualExpenseSheet>[0]> = {},
) {
  const setLinkedTxRole = vi.fn();
  const setManualDebts = vi.fn();
  render(
    <ManualExpenseSheet
      open
      onClose={() => undefined}
      initialExpense={savedDebtExpense}
      manualDebts={[DEBT]}
      setManualDebts={setManualDebts}
      setLinkedTxRole={setLinkedTxRole}
      {...overrides}
    />,
  );
  return { setLinkedTxRole, setManualDebts };
}

const PAYMENT_PROMPT = /Це сплата по боргу/;

describe("ManualExpenseSheet — місток до пасиву", () => {
  it("збережена витрата з категорією Борг пропонує привʼязку", () => {
    renderSheet();
    expect(screen.getByText(PAYMENT_PROMPT)).toBeTruthy();
  });

  it("привʼязка пише повну суму збереженого запису в гривнях", () => {
    // Ручний запис зберігає ГРИВНІ, на відміну від банківської операції в
    // копійках. Помилка на сто разів тут була б мовчазною.
    const { setLinkedTxRole } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "Обрати пасив" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Кредитка ПриватБанк/ }),
    );
    expect(setLinkedTxRole).toHaveBeenCalledWith(
      "d1",
      "m1",
      "debt",
      "payment",
      1000,
    );
  });

  it("розділений запис привʼязує саме боргову частку", () => {
    const { setLinkedTxRole } = renderSheet({
      txSplits: {
        m1: [
          { categoryId: "debt", amount: 150 },
          { categoryId: "food", amount: 850 },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Обрати пасив" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Кредитка ПриватБанк/ }),
    );
    expect(setLinkedTxRole).toHaveBeenCalledWith(
      "d1",
      "m1",
      "debt",
      "payment",
      150,
    );
  });

  it("розділений запис без боргової частки містка не показує", () => {
    renderSheet({
      txSplits: { m1: [{ categoryId: "food", amount: 1000 }] },
    });
    expect(screen.queryByText(PAYMENT_PROMPT)).toBeNull();
  });

  it("неборгова категорія містка не показує", () => {
    renderSheet({
      initialExpense: { ...savedDebtExpense, category: "food" },
    });
    expect(screen.queryByText(PAYMENT_PROMPT)).toBeNull();
  });

  it("новий (ще не збережений) запис містка не показує", () => {
    renderSheet({ initialExpense: null, initialCategory: "debt" });
    expect(screen.queryByText(PAYMENT_PROMPT)).toBeNull();
  });

  it("поверхня без пасивів містка не показує", () => {
    // `SilpoUnmatchedReceipts` рендерить той самий аркуш лише для
    // створення запису й цих пропів не передає.
    render(
      <ManualExpenseSheet
        open
        onClose={() => undefined}
        initialExpense={savedDebtExpense}
      />,
    );
    expect(screen.queryByText(PAYMENT_PROMPT)).toBeNull();
  });

  it("надходження з категорією Борг пропонує створити пасив", () => {
    // Роль `source`: борг щойно виник, тож створення нового пасиву тут
    // має сенс — на відміну від погашення.
    renderSheet({
      initialExpense: {
        ...savedDebtExpense,
        kind: "income",
        category: "debt-income",
      },
    });
    expect(screen.getByText(/Це борг\?/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Створити новий пасив" }),
    ).toBeTruthy();
  });
});
