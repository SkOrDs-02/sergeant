// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoutineHeader } from "./RoutineHeader";

afterEach(cleanup);

describe("RoutineHeader", () => {
  it("renders the module title and subtitle", () => {
    render(<RoutineHeader />);
    expect(screen.getByText("РУТИНА")).toBeInTheDocument();
    expect(
      screen.getByText("Звички · план Фізрука · один розклад"),
    ).toBeInTheDocument();
  });

  it("uses hub back button when onBackToHub is provided", () => {
    const onBackToHub = vi.fn();
    render(<RoutineHeader onBackToHub={onBackToHub} />);
    fireEvent.click(screen.getByRole("button", { name: "До хабу" }));
    expect(onBackToHub).toHaveBeenCalledOnce();
  });

  it("renders settings button when onOpenSettings is provided", () => {
    const onOpenSettings = vi.fn();
    render(<RoutineHeader onOpenSettings={onOpenSettings} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Налаштування модуля" }),
    );
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
