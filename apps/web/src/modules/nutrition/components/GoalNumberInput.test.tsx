// @vitest-environment jsdom
/**
 * Last validated: 2026-11-26
 * Status: Active
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOAL_INPUT_COMMIT_DELAY_MS, GoalNumberInput } from "./GoalNumberInput";

describe("GoalNumberInput (FULL-20261126-UX-1, п. 2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("набір «1800» по клавішах дає одне завершене значення, а не 1, 18, 180", () => {
    const onCommit = vi.fn();
    render(
      <GoalNumberInput value={null} onCommit={onCommit} aria-label="Ціль" />,
    );
    const input = screen.getByLabelText("Ціль");
    for (const v of ["1", "18", "180", "1800"]) {
      fireEvent.change(input, { target: { value: v } });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(GOAL_INPUT_COMMIT_DELAY_MS);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1800);
  });

  it("blur і Enter завершують значення одразу, без повтору після паузи", () => {
    const onCommit = vi.fn();
    render(
      <GoalNumberInput value={null} onCommit={onCommit} aria-label="Ціль" />,
    );
    const input = screen.getByLabelText("Ціль");
    fireEvent.change(input, { target: { value: "2200" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(2200);
    act(() => {
      vi.advanceTimersByTime(GOAL_INPUT_COMMIT_DELAY_MS * 2);
    });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("порожнє поле дає null, а незмінене значення нічого не шле", () => {
    const onCommit = vi.fn();
    render(
      <GoalNumberInput value={1500} onCommit={onCommit} aria-label="Ціль" />,
    );
    const input = screen.getByLabelText("Ціль");
    fireEvent.change(input, { target: { value: "1500" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(null);
  });

  it("розмонтування посеред набору не губить значення", () => {
    const onCommit = vi.fn();
    const { unmount } = render(
      <GoalNumberInput value={null} onCommit={onCommit} aria-label="Ціль" />,
    );
    fireEvent.change(screen.getByLabelText("Ціль"), {
      target: { value: "90" },
    });
    unmount();
    expect(onCommit).toHaveBeenCalledWith(90);
  });
});
