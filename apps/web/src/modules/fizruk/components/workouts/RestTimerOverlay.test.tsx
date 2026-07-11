// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RestTimerOverlay } from "./RestTimerOverlay";

describe("RestTimerOverlay", () => {
  afterEach(cleanup);

  it("renders nothing when restTimer is null", () => {
    const { container } = render(
      <RestTimerOverlay restTimer={null} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows countdown and calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 45, total: 90 }}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "Відпочинок, залишилось 45 секунд",
    );
    fireEvent.click(screen.getByRole("button", { name: /Скасувати/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("applies urgent styling when remaining is 10 seconds or less", () => {
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 8, total: 60 }}
        onCancel={vi.fn()}
      />,
    );

    const panel = screen.getByRole("timer").querySelector(".fizruk-sheet");
    expect(panel).toHaveClass("border-warning/60");
  });
});
