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

function renderStrip(
  filter = "all",
  onChange = vi.fn(),
  activeCategoryLabel: string | null = null,
) {
  render(
    <TransactionFilters
      filter={filter}
      onChangeFilter={onChange}
      hasCreditAccounts={false}
      activeCategoryLabel={activeCategoryLabel}
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
    // Фільтр за категорією не має власної пігулки — якорем стає «Всі».
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
    // wrap from first → last on ArrowLeft. Остання пігулка — «Доходи»:
    // чипів категорій у тулбарі більше немає.
    fireEvent.keyDown(all, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Доходи" }),
    );
  });

  it("Home / End jump to first / last pill", () => {
    renderStrip("all");
    const all = screen.getByRole("button", { name: "Всі" });
    const last = screen.getByRole("button", { name: "Доходи" });
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

  /*
    Рішення власника 2026-08-06: чипи категорій зі смуги прибрані —
    їхню роль виконує клікабельне кільце на Аналітиці. Тести нижче
    фіксують те, що прийшло на заміну.
  */
  it("не рендерить чипів категорій — лише базові фільтри", () => {
    renderStrip();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Їжа/ })).toBeNull();
  });

  it("показує знімний чип, коли фільтр прийшов дрил-дауном", () => {
    renderStrip("food", vi.fn(), "Їжа");
    expect(screen.getByRole("button", { name: /Їжа/ })).toBeInTheDocument();
  });

  it("чип пояснює, ЩО він робить, а не лише називає категорію", () => {
    renderStrip("food", vi.fn(), "Їжа");
    // Доступна назва мусить містити дію — інакше скрінрідер оголосить
    // саму лише назву категорії, і незрозуміло, що кнопка знімає фільтр.
    expect(
      screen.getByRole("button", { name: /Прибрати фільтр за категорією/ }),
    ).toBeInTheDocument();
  });

  it("клік по чипу скидає фільтр на «Всі»", () => {
    const onChange = vi.fn();
    renderStrip("food", onChange, "Їжа");
    fireEvent.click(screen.getByRole("button", { name: /Їжа/ }));
    expect(onChange).toHaveBeenCalledWith("all");
  });

  it("чип не бере участі в roving-tabindex тулбара", () => {
    renderStrip("food", vi.fn(), "Їжа");
    const chip = screen.getByRole("button", { name: /Їжа/ });
    expect(chip.getAttribute("tabindex")).toBeNull();
    expect(chip.getAttribute("aria-pressed")).toBeNull();
  });

  it("does not toggle off a base filter pill (all/income/expense/credit) on repeat tap", () => {
    const onChange = renderStrip("income");
    fireEvent.click(screen.getByRole("button", { name: "Доходи" }));
    expect(onChange).toHaveBeenCalledWith("income");
  });

  it("allows horizontal touch-panning inside the strip even under an ancestor touch-pan-y (bug fix)", () => {
    const { container } = render(
      <TransactionFilters
        filter="all"
        onChangeFilter={vi.fn()}
        hasCreditAccounts={false}
      />,
    );
    const scroller = container.querySelector("[data-no-swipe]");
    expect(scroller).not.toBeNull();
    // The strip is its own scroll container, so the touch-action chain for a
    // horizontal pan stops here — it must allow pan-x. It also declares pan-y
    // so a vertical page-scroll started on a chip still bubbles up through
    // FinykApp's touch-pan-y wrapper instead of being swallowed (data-no-swipe
    // alone only opts out of the JS swipe gesture, not the CSS touch-action).
    expect(scroller).toHaveClass("[touch-action:pan-x_pan-y]");
  });
});
