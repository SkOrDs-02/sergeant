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
