// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ScoreButton } from "./ScoreButton";

describe("ScoreButton", () => {
  afterEach(cleanup);

  it("renders value and label with selected styling", () => {
    render(
      <ScoreButton
        value={3}
        selected={true}
        onClick={vi.fn()}
        label="Нормально"
        tabbable={true}
      />,
    );

    const btn = screen.getByRole("radio", { name: /3/ });
    expect(btn).toHaveAttribute("aria-checked", "true");
    expect(btn).toHaveAttribute("tabIndex", "0");
    expect(screen.getByText("Нормально")).toBeInTheDocument();
  });

  it("calls onClick with value and skips tab stop when not tabbable", () => {
    const onClick = vi.fn();
    render(
      <ScoreButton
        value={5}
        selected={false}
        onClick={onClick}
        label="Відмінно"
        tabbable={false}
      />,
    );

    const btn = screen.getByRole("radio");
    expect(btn).toHaveAttribute("tabIndex", "-1");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith(5);
  });
});
