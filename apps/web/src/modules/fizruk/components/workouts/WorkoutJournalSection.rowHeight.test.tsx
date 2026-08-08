// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Regression coverage for the journal virtualization row-height estimate
 * (fizruk audit wave 2, defect #7): a flat `JOURNAL_ITEM_HEIGHT` estimate
 * under-counted rows that render a `note` line (`WorkoutRow` grows a
 * second, line-clamp(2) caption line below the date/badge line), so the
 * fixed-height scroll container ended up shorter than its actual content
 * and produced a nested scroll/clipped last row. `WorkoutJournalSection`
 * now derives both the outer container height and the per-row
 * `estimateSize` from `estimateJournalRowHeight`, which adds extra height
 * whenever a workout has a `note`.
 *
 * We don't render the real `@tanstack/react-virtual`-backed `VirtualList`
 * here (that needs `ResizeObserver`/layout machinery jsdom doesn't
 * provide) — instead we replace it with a probe that records the `height`
 * and `estimateSize` props it was called with, so the assertions target
 * exactly the values `WorkoutJournalSection` computed.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { ToastProvider } from "@shared/hooks/useToast";

const virtualListSpy = vi.fn();

vi.mock("../workouts/ActiveWorkoutPanel", () => ({
  ActiveWorkoutPanel: () => <div data-testid="active-panel" />,
}));

vi.mock("@shared/components/ui/SwipeToAction", () => ({
  SwipeToAction: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@shared/components/ui/VirtualList", () => ({
  VirtualList: (props: {
    items: unknown[];
    height: number;
    estimateSize: number | ((index: number) => number);
    children: (item: unknown, index: number) => React.ReactNode;
  }) => {
    virtualListSpy({ height: props.height, estimateSize: props.estimateSize });
    return (
      <div data-testid="virtual-list">
        {props.items.map((item, i) => (
          <div key={i}>{props.children(item, i)}</div>
        ))}
      </div>
    );
  },
}));

import { WorkoutJournalSection } from "./WorkoutJournalSection";

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function makeWorkout(override: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: new Date("2025-03-10T10:00:00Z").toISOString(),
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...override,
  };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    activeWorkout: null,
    activeDuration: null,
    workouts: [],
    activeWorkoutId: null,
    setActiveWorkoutId: vi.fn(),
    retroOpen: false,
    setRetroOpen: vi.fn(),
    retroDate: "2025-03-10",
    setRetroDate: vi.fn(),
    retroTime: "10:00",
    setRetroTime: vi.fn(),
    createWorkout: vi.fn(() => makeWorkout()),
    setMode: vi.fn(),
    musclesUk: {},
    recBy: {},
    lastByExerciseId: {},
    setRestTimer: vi.fn(),
    updateWorkout: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    setFinishFlash: vi.fn(),
    endWorkout: vi.fn(),
    summarizeWorkoutForFinish: vi.fn(() => null),
    submitRetroWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
  virtualListSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WorkoutJournalSection – virtualized row height estimate", () => {
  it("sizes the container from the flat 60px estimate when no row has a note", () => {
    const workouts = [
      makeWorkout({ id: "w1" }),
      makeWorkout({ id: "w2" }),
      makeWorkout({ id: "w3" }),
    ];
    renderWithToast(<WorkoutJournalSection {...baseProps({ workouts })} />);

    expect(virtualListSpy).toHaveBeenCalledTimes(1);
    const call = virtualListSpy.mock.calls[0]![0] as {
      height: number;
      estimateSize: (index: number) => number;
    };
    expect(call.height).toBe(180); // 3 * 60
    expect(call.estimateSize(0)).toBe(60);
    expect(call.estimateSize(1)).toBe(60);
    expect(call.estimateSize(2)).toBe(60);
  });

  it("grows the container height and the per-row estimate for rows with a note", () => {
    const workouts = [
      makeWorkout({ id: "w1" }), // no note → 60
      makeWorkout({ id: "w2", note: "Важке тренування, боліли плечі" }), // noted → 96
    ];
    renderWithToast(<WorkoutJournalSection {...baseProps({ workouts })} />);

    const call = virtualListSpy.mock.calls[0]![0] as {
      height: number;
      estimateSize: (index: number) => number;
    };
    // 60 (plain row) + 96 (60 + 36 note extra) = 156, not the flat 2*60=120
    // a uniform-height assumption would have produced.
    expect(call.height).toBe(156);
    expect(call.estimateSize(0)).toBe(60);
    expect(call.estimateSize(1)).toBe(96);
  });

  it("caps the container height at 10 flat rows even when notes would push it higher", () => {
    const workouts = Array.from({ length: 12 }, (_, i) =>
      makeWorkout({ id: `w${i}`, note: "Нотатка" }),
    );
    renderWithToast(<WorkoutJournalSection {...baseProps({ workouts })} />);

    const call = virtualListSpy.mock.calls[0]![0] as { height: number };
    expect(call.height).toBe(600); // MAX_JOURNAL_HEIGHT = 60 * 10
  });
});
