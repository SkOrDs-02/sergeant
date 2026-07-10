// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DayProgressRing } from "./DayProgressRing";

afterEach(cleanup);

describe("DayProgressRing", () => {
  it("shows completed/scheduled counts and day-report label", () => {
    render(<DayProgressRing completed={2} scheduled={5} />);
    expect(screen.getByText("2/5")).toBeInTheDocument();
    expect(screen.getByText("Денний звіт")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Прогрес дня: 2 з 5. Тапни для денного звіту",
      }),
    ).toBeInTheDocument();
  });

  it("calls onClick when the ring is tapped", () => {
    const onClick = vi.fn();
    render(<DayProgressRing completed={1} scheduled={3} onClick={onClick} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Прогрес дня: 1 з 3. Тапни для денного звіту",
      }),
    );
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("handles zero scheduled habits without dividing by zero", () => {
    render(<DayProgressRing completed={0} scheduled={0} />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});
