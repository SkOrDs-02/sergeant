// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { isFinykBalanceHidden } from "@finyk/lib/balanceVisibility";
import { ModulePanel } from "./ModulePanel";

vi.mock("@shared/lib/storage/storage", () => ({ safeReadStringLS: vi.fn() }));
vi.mock("@finyk/lib/balanceVisibility", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isFinykBalanceHidden: vi.fn(() => false),
}));
afterEach(cleanup);
beforeEach(() => {
  vi.mocked(isFinykBalanceHidden).mockReturnValue(false);
  vi.mocked(safeReadStringLS).mockReturnValue(
    JSON.stringify({
      todaySpent: 1234,
      weekWorkouts: 3,
      todayDone: 2,
      todayTotal: 4,
      todayCal: 1500,
      calGoal: 2000,
    }),
  );
});

describe("ModulePanel money privacy", () => {
  it("маскує тільки фінансовий показник та відновлює його після явного показу сум", () => {
    vi.mocked(isFinykBalanceHidden).mockReturnValue(true);
    const { rerender } = render(
      <ModulePanel
        activeModules={["finyk", "fizruk", "routine", "nutrition"]}
      />,
    );
    const finance = screen.getByRole("button", {
      name: "Перейти до модуля Фінік",
    });
    expect(finance).toHaveTextContent("••••");
    expect(finance).not.toHaveTextContent(/1\s234/);
    expect(
      screen.getByRole("button", { name: "Перейти до модуля Фізрук" }),
    ).toHaveTextContent("3 трен.");
    expect(
      screen.getByRole("button", { name: "Перейти до модуля Рутина" }),
    ).toHaveTextContent("2/4");
    vi.mocked(isFinykBalanceHidden).mockReturnValue(false);
    rerender(
      <ModulePanel
        activeModules={["finyk", "fizruk", "routine", "nutrition"]}
        storageBump={1}
      />,
    );
    expect(finance).toHaveTextContent(/1\s234/);
    expect(within(finance).queryByText("••••")).not.toBeInTheDocument();
  });
});

describe("ModulePanel bars", () => {
  const routineRow = () =>
    screen.getByRole("button", { name: "Перейти до модуля Рутина" });

  it("малює бар, коли значення дня не нуль", () => {
    render(<ModulePanel activeModules={["routine"]} />);
    expect(
      within(routineRow()).getByTestId("module-panel-bar"),
    ).toBeInTheDocument();
  });

  it("при нулі бару й доріжки немає", () => {
    vi.mocked(safeReadStringLS).mockReturnValue(
      JSON.stringify({ todayDone: 0, todayTotal: 4 }),
    );
    render(<ModulePanel activeModules={["routine"]} />);
    expect(
      within(routineRow()).queryByTestId("module-panel-bar"),
    ).not.toBeInTheDocument();
    expect(routineRow().querySelector(".bg-track")).toBeNull();
  });
});
