// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FUTURE_DAY_LABEL, HabitStateButton } from "./HabitStateButton";

describe("HabitStateButton — майбутній день (R4)", () => {
  afterEach(cleanup);

  it("невідмічений майбутній день неактивний і пояснює чому", () => {
    const onClick = vi.fn();
    render(
      <HabitStateButton
        completed={false}
        futureDay
        onClick={onClick}
        aria-label="Виконано"
      />,
    );
    const btn = screen.getByRole("button", { name: FUTURE_DAY_LABEL });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("data-habit-state", "future");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("уже наявну відмітку з майбутнього дня можна зняти", () => {
    const onClick = vi.fn();
    render(
      <HabitStateButton
        completed
        futureDay
        onClick={onClick}
        aria-label="Скасувати виконання"
      />,
    );
    const btn = screen.getByRole("button", { name: "Скасувати виконання" });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("звичайний день лишається активним", () => {
    render(<HabitStateButton completed={false} aria-label="Виконано" />);
    expect(screen.getByRole("button", { name: "Виконано" })).not.toBeDisabled();
  });
});
