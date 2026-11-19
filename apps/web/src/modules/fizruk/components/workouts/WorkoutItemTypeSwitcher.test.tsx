// @vitest-environment jsdom
/**
 * Tests for `WorkoutItemTypeSwitcher` — the "Тип" control in
 * `ExerciseDetailSheet`. Шість типів «за виміром» (спека
 * `fizruk-exercise-measure-type.md`, зріз 4): перемикач пише `measure` і
 * похідний `type`, рядки підходів лишаються, сумісні поля зберігаються.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { WorkoutItemTypeSwitcher } from "./WorkoutItemTypeSwitcher";

afterEach(cleanup);

describe("WorkoutItemTypeSwitcher", () => {
  it("показує шість типів", () => {
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [] }}
        isReadOnly={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(
      screen.getByRole("radio", { name: "Вага × повтори" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("«Час» пише measure і type, рядки лишаються, повтори зникають", () => {
    const onChange = vi.fn();
    const onMeasureChosen = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [{ weightKg: 50, reps: 0 }] }}
        isReadOnly={false}
        onChange={onChange}
        onMeasureChosen={onMeasureChosen}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Час: секунди" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        measure: "time",
        type: "time",
        sets: [{ weightKg: 0, reps: 0 }],
        durationSec: 0,
        distanceM: undefined,
      }),
    );
    expect(onMeasureChosen).toHaveBeenCalledWith("time");
  });

  it("«Вага × час» зберігає вагу, введену до першого підходу", () => {
    const onChange = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "strength", sets: [{ weightKg: 24, reps: 0 }] }}
        isReadOnly={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Вага × час" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        measure: "weight_time",
        sets: [{ weightKg: 24, reps: 0 }],
      }),
    );
  });

  it("старий item часу із сумою → один рядок із цими секундами", () => {
    const onChange = vi.fn();
    render(
      <WorkoutItemTypeSwitcher
        item={{ type: "time", durationSec: 30 }}
        isReadOnly={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Дистанція × час" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        measure: "distance_time",
        type: "distance",
        sets: [{ weightKg: 0, reps: 0, durationSec: 30 }],
      }),
    );
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
    const timeTab = screen.getByRole("radio", { name: "Час: секунди" });
    const activeTab = screen.getByRole("radio", { name: "Вага × повтори" });

    fireEvent.click(timeTab);
    expect(onChange).not.toHaveBeenCalled();

    activeTab.focus();
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();

    expect(activeTab).toBeDisabled();
    expect(timeTab).toBeDisabled();
  });
});
