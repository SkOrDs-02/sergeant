// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DayProgressRing } from "./DayProgressRing";

describe("DayProgressRing", () => {
  afterEach(cleanup);

  it("shows completed/scheduled ratio and calls onClick", () => {
    const onClick = vi.fn();
    render(<DayProgressRing completed={2} scheduled={5} onClick={onClick} />);

    expect(screen.getByText("2/5")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /Прогрес дня: 2 з 5/i,
      }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("handles zero scheduled habits without division errors", () => {
    render(<DayProgressRing completed={0} scheduled={0} />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});
