// @vitest-environment jsdom
/**
 * Пресети суми в аркуші «Фільтри» (рішення власника 2026-11-19, Ф-2 (б)):
 * тап заповнює «від» і «до», повторний тап знімає, ручна правка знімає
 * підсвітку, «Показати N» рахується з пресетом.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { TransactionsFiltersSheet } from "./TransactionsFiltersSheet";
import { EMPTY_TX_ADVANCED_FILTERS } from "./transactionAdvancedFilters";

const tx = (id: string, amount: number) =>
  ({ id, description: id, amount, time: 1 }) as Transaction;

// 50 ₴, 300 ₴, 500 ₴ (межа), 800 ₴, 2 000 ₴.
const LIST = [
  tx("a", -5_000),
  tx("b", -30_000),
  tx("c", -50_000),
  tx("d", -80_000),
  tx("e", -200_000),
];

function renderSheet(onApply = vi.fn()) {
  render(
    <TransactionsFiltersSheet
      value={EMPTY_TX_ADVANCED_FILTERS}
      baseList={LIST}
      monthTx={LIST}
      tags={undefined}
      accounts={[]}
      onApply={onApply}
      onClose={() => {}}
    />,
  );
  return onApply;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s/g, " ");
const preset = (label: string) =>
  screen.getAllByRole("radio").find((el) => norm(el.textContent) === label)!;
const from = () => screen.getByLabelText("Від") as HTMLInputElement;
const to = () => screen.getByLabelText("До") as HTMLInputElement;
const applyButton = () => screen.getByRole("button", { name: /^Показати/ });

afterEach(cleanup);

describe("пресети суми в аркуші «Фільтри»", () => {
  it.each([
    ["до 100 ₴", "", "100", 1],
    ["100–500 ₴", "100", "500", 2],
    ["500–1 000 ₴", "500", "1000", 2],
    ["понад 1 000 ₴", "1000", "", 1],
  ])("тап по «%s» ставить межі і «Показати N»", (label, f, t, count) => {
    const onApply = renderSheet();
    fireEvent.click(preset(label));
    expect(from().value).toBe(f);
    expect(to().value).toBe(t);
    expect(preset(label).getAttribute("aria-checked")).toBe("true");
    expect(norm(applyButton().textContent)).toContain(String(count));
    fireEvent.click(applyButton());
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("повторний тап по активному пресету знімає його і чистить поля", () => {
    renderSheet();
    fireEvent.click(preset("100–500 ₴"));
    fireEvent.click(preset("100–500 ₴"));
    expect(from().value).toBe("");
    expect(to().value).toBe("");
    expect(preset("100–500 ₴").getAttribute("aria-checked")).toBe("false");
    expect(norm(applyButton().textContent)).toContain("5");
  });

  it("ручна правка поля знімає підсвітку, а збіг із пресетом повертає її", () => {
    renderSheet();
    fireEvent.click(preset("100–500 ₴"));
    fireEvent.change(to(), { target: { value: "600" } });
    expect(
      screen
        .getAllByRole("radio")
        .some((el) => el.getAttribute("aria-checked") === "true"),
    ).toBe(false);
    fireEvent.change(to(), { target: { value: "500" } });
    expect(preset("100–500 ₴").getAttribute("aria-checked")).toBe("true");
  });
});
