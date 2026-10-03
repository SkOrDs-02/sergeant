// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsMonoCards } from "./AssetsMonoCards";

const accounts = [
  { id: "acc-1", balance: 123400, currencyCode: 980, type: "black" },
  { id: "acc-2", balance: 500, currencyCode: 980, type: "white" },
];

describe("AssetsMonoCards", () => {
  it("keeps excluded cards visible and labelled", () => {
    render(
      <AssetsMonoCards
        accounts={accounts}
        hiddenAccounts={["acc-2"]}
        toggleHideAccount={vi.fn()}
        showBalance
      />,
    );
    expect(
      screen.getAllByRole("button", { name: /налаштування/ }),
    ).toHaveLength(2);
    expect(screen.getByText("Не враховується")).toBeTruthy();
  });

  it("opens the sheet on tap and toggles the account", () => {
    const toggle = vi.fn();
    render(
      <AssetsMonoCards
        accounts={accounts}
        hiddenAccounts={[]}
        toggleHideAccount={toggle}
        showBalance
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Чорна картка: налаштування/ }),
    );
    const toggleInput = screen.getByRole("switch", {
      name: /Враховувати картку/,
    });
    expect((toggleInput as HTMLInputElement).checked).toBe(true);
    fireEvent.click(toggleInput);
    expect(toggle).toHaveBeenCalledWith("acc-1");
  });

  // Кредитка з витраченим лімітом: власних коштів понад ліміт немає, тож
  // сума в «Активах» — чесний 0. Без припису рядок читається як порожня
  // картка, і звʼязок із боргом у «Пасивах» на екрані не видно.
  // Знахідка founder-а 2026-08-10.
  describe("кредитка з боргом", () => {
    // creditLimit 10 000 ₴, balance −2 000 ₴ → перевитрата поверх ліміту.
    // Борг = (1_000_000 − (−200_000)) / 100 = 12 000 ₴.
    const overLimitCredit = [
      {
        id: "cc-1",
        balance: -200_000,
        creditLimit: 1_000_000,
        currencyCode: 980,
        type: "black",
      },
    ];

    it("показує борг разом із нулем власних коштів", () => {
      render(
        <AssetsMonoCards
          accounts={overLimitCredit}
          hiddenAccounts={[]}
          toggleHideAccount={vi.fn()}
          showBalance
        />,
      );
      const row = screen.getByRole("button", {
        name: /Кредитна картка: налаштування/,
      });
      // Обидва числа в одному рядку: 0 власних коштів і 12 000 боргу.
      // Пробіли-роздільники в `Money` — нерозривні, тож нормалізуємо.
      const text = (row.textContent ?? "").replace(/\s/g, " ");
      expect(text).toContain("0,00");
      expect(text).toMatch(/борг/);
      expect(text).toMatch(/12 000/);
      expect(text).toMatch(/у Пасивах/);
    });

    it("ховає борг разом із балансом під приватним режимом", () => {
      render(
        <AssetsMonoCards
          accounts={overLimitCredit}
          hiddenAccounts={[]}
          toggleHideAccount={vi.fn()}
          showBalance={false}
        />,
      );
      // Борг — така сама приватна цифра, як залишок: під «••••» його
      // не має бути видно взагалі.
      expect(screen.queryByText(/борг/)).toBeNull();
      expect(screen.queryByText(/12 000/)).toBeNull();
    });

    it("не чіпає звичайну картку без кредитного ліміту", () => {
      render(
        <AssetsMonoCards
          accounts={accounts}
          hiddenAccounts={[]}
          toggleHideAccount={vi.fn()}
          showBalance
        />,
      );
      expect(screen.queryByText(/борг/)).toBeNull();
    });
  });
});
