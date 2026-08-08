// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * `WorkoutHistoryList` — extracted from `WorkoutJournalSection.tsx` as
 * part of the 03-A history-route split. Covers: empty state, row
 * navigation (replaces the old local-selection toggle), badge variants
 * (now just ended/active — the "one active workout" invariant means a
 * non-ended row is never ambiguous), swipe-to-delete gating, and the
 * virtualized row-height estimate (migrated from
 * `WorkoutJournalSection.rowHeight.test.tsx`).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { ToastProvider } from "@shared/hooks/useToast";

const virtualListSpy = vi.fn();

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

vi.mock("@shared/components/ui/SwipeToAction", () => ({
  SwipeToAction: ({
    children,
    onSwipeLeft,
    rightLabel,
  }: {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
    rightLabel?: string;
  }) => (
    <div data-testid="swipe-wrapper">
      {children}
      {onSwipeLeft && (
        <button type="button" data-testid="swipe-delete" onClick={onSwipeLeft}>
          {rightLabel ?? "Видалити"}
        </button>
      )}
    </div>
  ),
}));

import { WorkoutHistoryList } from "./WorkoutHistoryList";

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
    workouts: [],
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    onOpenWorkout: vi.fn(),
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

describe("WorkoutHistoryList – empty state", () => {
  it("shows the empty state when the workout list is empty", () => {
    renderWithToast(<WorkoutHistoryList {...baseProps()} />);
    expect(screen.getByText(/поки немає тренувань/i)).toBeTruthy();
  });
});

describe("WorkoutHistoryList – row navigation", () => {
  it("navigates to the routed single-workout view on row click", () => {
    const onOpenWorkout = vi.fn();
    const w = makeWorkout({ id: "w-row" });
    renderWithToast(
      <WorkoutHistoryList {...baseProps({ workouts: [w], onOpenWorkout })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Активне/ }));
    expect(onOpenWorkout).toHaveBeenCalledWith("w-row");
  });
});

describe("WorkoutHistoryList – badge variants", () => {
  it("shows Завершене badge for ended workout", () => {
    const ended = makeWorkout({
      id: "w-ended",
      endedAt: new Date().toISOString(),
    });
    renderWithToast(
      <WorkoutHistoryList {...baseProps({ workouts: [ended] })} />,
    );
    expect(screen.getByText("Завершене")).toBeTruthy();
  });

  it("shows Активне badge for any non-ended workout (single-active invariant)", () => {
    const active = makeWorkout({ id: "w-active" });
    renderWithToast(
      <WorkoutHistoryList {...baseProps({ workouts: [active] })} />,
    );
    expect(screen.getByText("Активне")).toBeTruthy();
  });

  it("shows workout note when present", () => {
    const noted = makeWorkout({ id: "w-note", note: "Важке тренування" });
    renderWithToast(
      <WorkoutHistoryList {...baseProps({ workouts: [noted] })} />,
    );
    expect(screen.getByText("Важке тренування")).toBeTruthy();
  });
});

describe("WorkoutHistoryList – swipe-to-delete", () => {
  it("calls deleteWorkout on swipe-left for an ended workout", () => {
    const deleteWorkout = vi.fn();
    const restoreWorkout = vi.fn();
    const w = makeWorkout({ id: "w-del", endedAt: new Date().toISOString() });
    renderWithToast(
      <WorkoutHistoryList
        {...baseProps({ workouts: [w], deleteWorkout, restoreWorkout })}
      />,
    );
    const deleteBtn = screen.getByTestId("swipe-delete");
    act(() => {
      fireEvent.click(deleteBtn);
    });
    expect(deleteWorkout).toHaveBeenCalledWith("w-del");
  });

  it("does NOT render swipe-delete for the (single) in-flight active workout", () => {
    const w = makeWorkout({ id: "w-active" });
    renderWithToast(<WorkoutHistoryList {...baseProps({ workouts: [w] })} />);
    expect(screen.queryByTestId("swipe-delete")).toBeNull();
  });
});

describe("WorkoutHistoryList – virtualized row height estimate", () => {
  it("sizes the container from the flat 60px estimate when no row has a note", () => {
    const workouts = [
      makeWorkout({ id: "w1" }),
      makeWorkout({ id: "w2" }),
      makeWorkout({ id: "w3" }),
    ];
    renderWithToast(<WorkoutHistoryList {...baseProps({ workouts })} />);

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
    renderWithToast(<WorkoutHistoryList {...baseProps({ workouts })} />);

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
    renderWithToast(<WorkoutHistoryList {...baseProps({ workouts })} />);

    const call = virtualListSpy.mock.calls[0]![0] as { height: number };
    expect(call.height).toBe(600); // MAX_JOURNAL_HEIGHT = 60 * 10
  });
});
