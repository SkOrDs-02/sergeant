// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RestTimerOverlay } from "./RestTimerOverlay";

afterEach(cleanup);

describe("RestTimerOverlay", () => {
  it("renders nothing when restTimer is null", () => {
    const { container } = render(
      <RestTimerOverlay restTimer={null} onCancel={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the rest timer and cancel action", () => {
    const onCancel = vi.fn();
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 45, total: 60 }}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "Відпочинок, залишилось 45 секунд",
    );
    expect(screen.getByText("Відпочинок")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("applies urgent styling when under ten seconds remain", () => {
    render(
      <RestTimerOverlay
        restTimer={{ remaining: 5, total: 60 }}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("00:05")).toHaveClass("text-warning-strong");
  });
});
