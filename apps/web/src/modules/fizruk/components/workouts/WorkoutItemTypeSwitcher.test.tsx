// @vitest-environment jsdom
/**
 * Tests for `WorkoutItemTypeSwitcher` — the "Тип" segmented control
 * moved out of `WorkoutItemCard` into `ExerciseDetailSheet` in the
 * 2026-08 redesign (item 5). Mirrors the pre-redesign coverage that
 * used to live in `WorkoutItemCard.test.tsx` for the in-card Segmented.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { WorkoutItemTypeSwitcher } from "./WorkoutItemTypeSwitcher";

afterEach(cleanup);

describe("WorkoutItemTypeSwitcher", () => {
  it("switching to 'Час' calls onChange with a duration patch", () => {
    const onChange = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [{ weightKg: 50, reps: 8 }] }}
        isReadOnly={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Час: секунди" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "time" }),
    );
  });

  it("switching away from 'Силова' clears sets so old volume can't survive the merge", () => {
    const onChange = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [{ weightKg: 80, reps: 10 }] }}
        isReadOnly={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Час: секунди" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "time", sets: undefined }),
    );
  });

  it("switching to 'Дист' calls onChange with distanceM + durationSec", () => {
    const onChange = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [] }}
        isReadOnly={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("tab", { name: "Дистанція: метри та час" }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "distance",
        distanceM: 0,
        durationSec: 0,
      }),
    );
  });

  it("switching to 'Силова' seeds an empty set when there were none", () => {
    const onChange = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "time", durationSec: 30 }}
        isReadOnly={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(
      screen.getByRole("tab", { name: "Силова: кг × повтори × підходи" }),
    );
    expect(onChange).toHaveBeenCalledWith({
      type: "strength",
      sets: [{ weightKg: 0, reps: 0 }],
    });
  });

  it("blocks the control from both click and keyboard when read-only", () => {
    const onChange = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [{ weightKg: 50, reps: 8 }] }}
        isReadOnly
        onChange={onChange}
      />,
    );
    const timeTab = screen.getByRole("tab", { name: "Час: секунди" });
    const activeTab = screen.getByRole("tab", {
      name: "Силова: кг × повтори × підходи",
    });

    fireEvent.click(timeTab);
    expect(onChange).not.toHaveBeenCalled();

    activeTab.focus();
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();

    expect(activeTab).toHaveAttribute("tabindex", "-1");
    expect(timeTab).toHaveAttribute("tabindex", "-1");
  });

  it("keeps a non-read-only tab in the normal roving-tabindex order", () => {
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [] }}
        isReadOnly={false}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("tab", { name: "Силова: кг × повтори × підходи" }),
    ).toHaveAttribute("tabindex", "0");
  });
});
