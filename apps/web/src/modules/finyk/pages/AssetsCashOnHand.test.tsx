// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssetsCashOnHand } from "./AssetsCashOnHand";

describe("AssetsCashOnHand", () => {
  it("без рахунку просить суму і створює рахунок у копійках", () => {
    const onCreate = vi.fn();
    render(
      <AssetsCashOnHand
        balanceMinor={null}
        onCreate={onCreate}
        onSetActual={vi.fn()}
        showBalance
      />,
    );
    expect(screen.getByText("Скільки готівки зараз?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Сума готівки, ₴"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Почати облік" }));
    expect(onCreate).toHaveBeenCalledWith(100_000);
  });

  it("порожня сума не створює рахунок", () => {
    const onCreate = vi.fn();
    render(
      <AssetsCashOnHand
        balanceMinor={null}
        onCreate={onCreate}
        onSetActual={vi.fn()}
        showBalance
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Почати облік" }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Вкажи суму від 0 ₴")).toBeTruthy();
  });

  it("з рахунком показує баланс і записує фактичну суму", () => {
    const onSetActual = vi.fn();
    render(
      <AssetsCashOnHand
        balanceMinor={80_000}
        onCreate={vi.fn()}
        onSetActual={onSetActual}
        showBalance
      />,
    );
    expect(screen.getByTestId("finyk-cash-card").textContent).toContain("800");
    fireEvent.click(
      screen.getByRole("button", { name: "Вказати фактичну суму" }),
    );
    fireEvent.change(screen.getByLabelText("Фактична сума, ₴"), {
      target: { value: "750" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(onSetActual).toHaveBeenCalledWith(75_000);
  });
});
