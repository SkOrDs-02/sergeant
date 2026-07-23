// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TransactionsHeader } from "./TransactionsHeader";

afterEach(() => cleanup());

function renderHeader(
  overrides: Partial<Parameters<typeof TransactionsHeader>[0]> = {},
) {
  const goMonth = vi.fn();
  const exitSelectMode = vi.fn();
  const setSelectMode = vi.fn();
  const setShowHidden = vi.fn();

  render(
    <TransactionsHeader
      monthLabel="червень 2026 р."
      isCurrentMonth={false}
      goMonth={goMonth}
      selectMode={false}
      exitSelectMode={exitSelectMode}
      setSelectMode={setSelectMode}
      showHidden={false}
      setShowHidden={setShowHidden}
      hiddenCount={0}
      {...overrides}
    />,
  );

  return { goMonth, exitSelectMode, setSelectMode, setShowHidden };
}

describe("TransactionsHeader", () => {
  it("renders the month label between prev/next navigation buttons", () => {
    renderHeader({ monthLabel: "травень 2026 р." });
    expect(screen.getByText("травень 2026 р.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Попередній місяць" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Наступний місяць" }),
    ).toBeInTheDocument();
  });

  it("calls goMonth(-1) / goMonth(1) when month navigation buttons are clicked", () => {
    const { goMonth } = renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    fireEvent.click(screen.getByRole("button", { name: "Наступний місяць" }));
    expect(goMonth).toHaveBeenCalledWith(-1);
    expect(goMonth).toHaveBeenCalledWith(1);
  });

  it("disables the next-month button on the current month", () => {
    renderHeader({ isCurrentMonth: true });
    expect(
      screen.getByRole("button", { name: "Наступний місяць" }),
    ).toBeDisabled();
  });

  it("shows the hidden toggle when hiddenCount > 0", () => {
    renderHeader({ hiddenCount: 3 });
    expect(screen.getByText("3 прих.")).toBeInTheDocument();
  });

  it("hides the hidden toggle when hiddenCount is zero", () => {
    renderHeader({ hiddenCount: 0 });
    expect(screen.queryByText(/прих\./)).not.toBeInTheDocument();
  });

  it("toggles showHidden via setShowHidden when the hidden button is clicked", () => {
    const { setShowHidden } = renderHeader({ hiddenCount: 2 });
    fireEvent.click(screen.getByText("2 прих."));
    expect(setShowHidden).toHaveBeenCalledTimes(1);
    expect(typeof setShowHidden.mock.calls[0]?.[0]).toBe("function");
  });

  it("replaces the action cluster with Скасувати while select mode is active", () => {
    const { exitSelectMode } = renderHeader({
      selectMode: true,
      hiddenCount: 5,
    });
    expect(screen.getByText("Скасувати")).toBeInTheDocument();
    expect(screen.queryByText(/прих\./)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Режим вибору" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Скасувати"));
    expect(exitSelectMode).toHaveBeenCalledTimes(1);
  });

  it("enters select mode via the Режим вибору button", () => {
    const { setSelectMode } = renderHeader({ hiddenCount: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Режим вибору" }));
    expect(setSelectMode).toHaveBeenCalledWith(true);
  });

  it("shows the inline hint while select mode is active and nothing is selected", () => {
    renderHeader({ selectMode: true, selectedCount: 0 });
    expect(screen.getByText("Оберіть транзакції")).toBeInTheDocument();
  });

  it("hides the inline hint once at least one row is selected", () => {
    renderHeader({ selectMode: true, selectedCount: 2 });
    expect(screen.queryByText("Оберіть транзакції")).not.toBeInTheDocument();
  });
});
