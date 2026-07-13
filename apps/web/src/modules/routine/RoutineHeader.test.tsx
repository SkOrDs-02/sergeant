// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RoutineHeader } from "./RoutineHeader";

describe("RoutineHeader", () => {
  afterEach(cleanup);

  it("renders module title and subtitle", () => {
    render(<RoutineHeader />);
    expect(screen.getByText("РУТИНА")).toBeInTheDocument();
    expect(
      screen.getByText("Сьогоднішні звички й найближчі події"),
    ).toBeInTheDocument();
  });

  it("shows hub back button when onBackToHub is provided", () => {
    const onBackToHub = vi.fn();
    render(<RoutineHeader onBackToHub={onBackToHub} />);
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBackToHub).toHaveBeenCalledTimes(1);
  });

  it("shows a dedicated hub button when onGoToHub is provided", () => {
    const onBackToHub = vi.fn();
    const onGoToHub = vi.fn();
    render(<RoutineHeader onBackToHub={onBackToHub} onGoToHub={onGoToHub} />);
    fireEvent.click(screen.getByRole("button", { name: "На хаб" }));
    expect(onGoToHub).toHaveBeenCalledTimes(1);
    expect(onBackToHub).not.toHaveBeenCalled();
  });

  it("opens settings when onOpenSettings is provided", () => {
    const onOpenSettings = vi.fn();
    render(<RoutineHeader onOpenSettings={onOpenSettings} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Налаштування модуля/i }),
    );
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
