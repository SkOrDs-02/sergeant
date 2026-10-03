// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ClosedTodayItem } from "./closedToday";

const mocks = vi.hoisted(() => ({
  items: [] as ClosedTodayItem[],
  compute: vi.fn(),
}));
vi.mock("./closedToday", () => ({
  computeClosedToday: (...args: unknown[]) => {
    mocks.compute(...args);
    return mocks.items;
  },
}));

const { ClosedTodayPile } = await import("./ClosedTodayPile");

describe("ClosedTodayPile", () => {
  beforeEach(() => {
    mocks.items = [];
    mocks.compute.mockClear();
  });

  it("порожня купа не рендериться взагалі", () => {
    const { container } = render(
      <ClosedTodayPile
        activeModules={["finyk"]}
        recs={[]}
        onOpenModule={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("рядок — предмет дня, твердження і число; тап відкриває модуль", () => {
    mocks.items = [
      {
        module: "routine",
        label: "Звички",
        statement: "усі відмічені",
        value: "5/5",
      },
      {
        module: "finyk",
        label: "Витрати",
        statement: "записано · у межах лімітів",
        value: "250 ₴",
      },
    ];
    const onOpenModule = vi.fn();
    render(
      <ClosedTodayPile
        activeModules={["finyk", "routine"]}
        recs={[]}
        onOpenModule={onOpenModule}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Закрито сьогодні" }),
    ).toBeInTheDocument();
    const rows = screen.getAllByTestId("closed-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Звички");
    expect(rows[0]).toHaveTextContent("усі відмічені");
    expect(rows[0]).toHaveTextContent("5/5");

    fireEvent.click(rows[1]!);
    expect(onOpenModule).toHaveBeenCalledWith("finyk");
  });

  it("перераховується на тік сховища", () => {
    const { rerender } = render(
      <ClosedTodayPile
        activeModules={["finyk"]}
        recs={[]}
        onOpenModule={vi.fn()}
        storageBump={1}
      />,
    );
    rerender(
      <ClosedTodayPile
        activeModules={["finyk"]}
        recs={[]}
        onOpenModule={vi.fn()}
        storageBump={2}
      />,
    );
    expect(mocks.compute).toHaveBeenCalledTimes(2);
  });
});
