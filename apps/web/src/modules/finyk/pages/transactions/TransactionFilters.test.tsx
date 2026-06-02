// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TransactionFilters } from "./TransactionFilters";

/**
 * page-audit-05 F13: the filter strip is a WAI-ARIA toolbar with roving
 * tabindex + arrow-key focus movement. These tests lock that contract so a
 * future markup change can't silently regress keyboard navigation.
 */

afterEach(cleanup);

const CATS = [
  { id: "food", label: "🍔 Їжа" },
  { id: "transport", label: "🚗 Транспорт" },
];

function renderStrip(filter = "all", onChange = vi.fn()) {
  render(
    <TransactionFilters
      filter={filter}
      onChangeFilter={onChange}
      hasCreditAccounts={false}
      catSpends={CATS}
    />,
  );
  return onChange;
}

describe("TransactionFilters — toolbar a11y (F13)", () => {
  it("renders a labelled horizontal toolbar", () => {
    renderStrip();
    const toolbar = screen.getByRole("toolbar", { name: "Фільтр транзакцій" });
    expect(toolbar.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("uses roving tabindex — only the active pill is tabbable", () => {
    renderStrip("expense");
    const all = screen.getByRole("button", { name: "Всі" });
    const expense = screen.getByRole("button", { name: "Витрати" });
    expect(expense.getAttribute("tabindex")).toBe("0");
    expect(all.getAttribute("tabindex")).toBe("-1");
    expect(expense.getAttribute("aria-pressed")).toBe("true");
  });

  it("falls back to the first pill when the active filter isn't rendered", () => {
    // A category id that isn't in catSpends → no matching pill.
    renderStrip("missing-cat");
    expect(
      screen.getByRole("button", { name: "Всі" }).getAttribute("tabindex"),
    ).toBe("0");
  });

  it("ArrowRight / ArrowLeft move focus and wrap", () => {
    renderStrip("all");
    const all = screen.getByRole("button", { name: "Всі" });
    const expense = screen.getByRole("button", { name: "Витрати" });
    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(document.activeElement).toBe(expense);
    fireEvent.keyDown(expense, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(all);
    // wrap from first → last on ArrowLeft
    fireEvent.keyDown(all, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Транспорт/ }),
    );
  });

  it("Home / End jump to first / last pill", () => {
    renderStrip("all");
    const all = screen.getByRole("button", { name: "Всі" });
    const last = screen.getByRole("button", { name: /Транспорт/ });
    all.focus();
    fireEvent.keyDown(all, { key: "End" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Home" });
    expect(document.activeElement).toBe(all);
  });

  it("click invokes onChangeFilter with the pill id", () => {
    const onChange = renderStrip("all");
    fireEvent.click(screen.getByRole("button", { name: "Доходи" }));
    expect(onChange).toHaveBeenCalledWith("income");
  });
});
