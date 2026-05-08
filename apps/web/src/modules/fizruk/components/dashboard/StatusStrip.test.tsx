// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { DashboardKpis } from "@sergeant/fizruk-domain/domain";
import type { MuscleState } from "@sergeant/fizruk-domain";

import { StatusStrip } from "./StatusStrip";

afterEach(() => {
  cleanup();
});

function makeKpis(overrides: Partial<DashboardKpis> = {}): DashboardKpis {
  return {
    streakDays: 0,
    weeklyWorkoutsCount: 0,
    weeklyVolumeKg: 0,
    totalCompletedCount: 0,
    avgDurationSec: 0,
    latestWorkoutIso: null,
    weightChangeKg: null,
    weightWindowDays: 30,
    ...overrides,
  };
}

function makeMuscle(
  overrides: Partial<Pick<MuscleState, "id" | "label" | "status">> = {},
): Pick<MuscleState, "id" | "label" | "status"> {
  return {
    id: "chest",
    label: "Груди",
    status: "red",
    ...overrides,
  };
}

describe("StatusStrip", () => {
  it("renders Готовність as ОК when no muscles are flagged for avoidance", () => {
    render(
      <StatusStrip
        kpis={makeKpis()}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("ОК");
    expect(node.className).toContain("text-success");
  });

  it("names the single fatigued muscle group when exactly one is avoided", () => {
    render(
      <StatusStrip
        kpis={makeKpis()}
        recovery={{ avoid: [makeMuscle({ label: "Груди" })] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("Груди втомлені");
    expect(node.className).toContain("text-danger");
  });

  it("pluralises Готовність when several muscle groups are fatigued", () => {
    render(
      <StatusStrip
        kpis={makeKpis()}
        recovery={{
          avoid: [
            makeMuscle({ id: "chest", label: "Груди" }),
            makeMuscle({ id: "back", label: "Спина" }),
            makeMuscle({ id: "legs", label: "Ноги" }),
          ],
        }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("3 групи втомлені")).toBeDefined();
  });

  it("formats the streak with Ukrainian pluralisation", () => {
    const { rerender } = render(
      <StatusStrip
        kpis={makeKpis({ streakDays: 1 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("1 день")).toBeDefined();
    rerender(
      <StatusStrip
        kpis={makeKpis({ streakDays: 3 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("3 дні")).toBeDefined();
    rerender(
      <StatusStrip
        kpis={makeKpis({ streakDays: 11 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("11 днів")).toBeDefined();
  });

  it("formats the weekly workouts count with Ukrainian pluralisation", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weeklyWorkoutsCount: 2 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.getByText("2 тренування")).toBeDefined();
  });

  it("hides the weight chip when no measurements are available", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: null })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    expect(screen.queryByText(/Вага · /)).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("renders the weight chip with success tone for a weight loss", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: -1.4 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("−1.4 кг");
    expect(node.className).toContain("text-success");
  });

  it("renders the weight chip with danger tone for a weight gain", () => {
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: 2 })}
        recovery={{ avoid: [] }}
        onOpenBody={() => {}}
        onOpenProgress={() => {}}
        onOpenWorkouts={() => {}}
      />,
    );
    const node = screen.getByText("+2 кг");
    expect(node.className).toContain("text-danger");
  });

  it("routes each chip to its matching tab", () => {
    const onOpenBody = vi.fn();
    const onOpenProgress = vi.fn();
    const onOpenWorkouts = vi.fn();
    render(
      <StatusStrip
        kpis={makeKpis({ weightChangeKg: -0.5 })}
        recovery={{ avoid: [] }}
        onOpenBody={onOpenBody}
        onOpenProgress={onOpenProgress}
        onOpenWorkouts={onOpenWorkouts}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Готовність:/));
    fireEvent.click(screen.getByLabelText(/Серія:/));
    fireEvent.click(screen.getByLabelText(/Цей тиждень:/));
    fireEvent.click(screen.getByLabelText(/Зміна ваги/));
    expect(onOpenBody).toHaveBeenCalledTimes(2); // Готовність + Δ вага
    expect(onOpenProgress).toHaveBeenCalledTimes(1);
    expect(onOpenWorkouts).toHaveBeenCalledTimes(1);
  });
});
