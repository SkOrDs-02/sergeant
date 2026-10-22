// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManualExpenseAccountSection } from "./ManualExpenseAccountSection";

describe("ManualExpenseAccountSection", () => {
  it("готівка без рахунку спершу просить суму (Р3.3)", () => {
    const onAccountChange = vi.fn();
    const onCreateCash = vi.fn();
    render(
      <ManualExpenseAccountSection
        account={null}
        onAccountChange={onAccountChange}
        cashExists={false}
        onCreateCash={onCreateCash}
        isSubmitting={false}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Готівка на руках" }));
    expect(onAccountChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Скільки готівки зараз?"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Почати облік" }));
    expect(onCreateCash).toHaveBeenCalledWith(100_000);
    expect(onAccountChange).toHaveBeenCalledWith("cash");
  });

  it("з рахунком перемикає одразу", () => {
    const onAccountChange = vi.fn();
    render(
      <ManualExpenseAccountSection
        account="cash"
        onAccountChange={onAccountChange}
        cashExists
        onCreateCash={vi.fn()}
        isSubmitting={false}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "Готівка на руках" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Без рахунку" }));
    expect(onAccountChange).toHaveBeenCalledWith(null);
  });
});

describe("ManualExpenseAccountSection: підказка про дату до створення готівки", () => {
  const anchor = Date.parse("2026-10-20T12:00:00Z");
  const base = {
    account: "cash" as const,
    onAccountChange: vi.fn(),
    cashExists: true,
    onCreateCash: vi.fn(),
    isSubmitting: false,
    cashCreatedAt: anchor,
  };

  it("показує підказку для дати раніше за створення рахунку", () => {
    render(<ManualExpenseAccountSection {...base} date="2026-10-19" />);
    expect(
      screen.getByText(
        "Ця витрата раніше за момент, від якого рахується готівка, баланс не зміниться.",
      ),
    ).toBeInTheDocument();
  });

  it("ховає підказку для дати після створення, без готівки чи без рахунку", () => {
    const { rerender } = render(
      <ManualExpenseAccountSection {...base} date="2026-10-21" />,
    );
    expect(screen.queryByTestId("finyk-manual-cash-backdated-hint")).toBeNull();
    rerender(
      <ManualExpenseAccountSection
        {...base}
        account={null}
        date="2026-10-19"
      />,
    );
    expect(screen.queryByTestId("finyk-manual-cash-backdated-hint")).toBeNull();
  });
});
