// @vitest-environment jsdom
/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * `WorkoutHistory` — the dedicated `/fizruk/history` route page (03-A).
 * Verifies: no start-CTA anywhere on the page, back navigation, and row
 * navigation into the route-owned single-workout view. The list itself
 * (badges, swipe-delete, virtualization) is covered by
 * `WorkoutHistoryList.test.tsx`.
 */
import type { ReactElement, ReactNode } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import type { Workout } from "@sergeant/fizruk-domain";

const mockWorkouts: Workout[] = [];
const mockDeleteWorkout = vi.fn();
const mockRestoreWorkout = vi.fn();

vi.mock("../hooks/useWorkouts", () => ({
  useWorkouts: () => ({
    workouts: mockWorkouts,
    loaded: true,
    deleteWorkout: mockDeleteWorkout,
    restoreWorkout: mockRestoreWorkout,
  }),
}));

// The real `@tanstack/react-virtual`-backed `VirtualList` needs
// `ResizeObserver`/layout machinery jsdom doesn't provide — swap in a
// synchronous flat-render stub (same pattern as `WorkoutHistoryList.test.tsx`)
// so rows are actually queryable here.
vi.mock("@shared/components/ui/VirtualList", () => ({
  VirtualList: ({
    items,
    children,
  }: {
    items: unknown[];
    children: (item: unknown, index: number) => ReactNode;
  }) => (
    <div data-testid="virtual-list">
      {items.map((item, i) => (
        <div key={i}>{children(item, i)}</div>
      ))}
    </div>
  ),
}));

import { WorkoutHistory } from "./WorkoutHistory";

function renderWithToast(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockWorkouts.length = 0;
});

function makeWorkout(override: Partial<Workout> = {}): Workout {
  return {
    id: "w1",
    startedAt: new Date("2025-03-10T10:00:00Z").toISOString(),
    endedAt: new Date("2025-03-10T11:00:00Z").toISOString(),
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
    ...override,
  };
}

describe("WorkoutHistory page", () => {
  it("has no start-CTA — starting a session lives only on the Workouts home", () => {
    mockWorkouts.push(makeWorkout());
    renderWithToast(<WorkoutHistory onNavigate={vi.fn()} />);
    expect(screen.queryByText(/^\+ ?Нове$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Шаблони$/)).not.toBeInTheDocument();
  });

  it("navigates back to the workouts home via the header back button", () => {
    const onNavigate = vi.fn();
    renderWithToast(<WorkoutHistory onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText(/повернутись до тренувань/i));
    expect(onNavigate).toHaveBeenCalledWith("workouts");
  });

  it("navigates to the routed single-workout view when a row is tapped", () => {
    mockWorkouts.push(makeWorkout({ id: "w-42" }));
    const onNavigate = vi.fn();
    renderWithToast(<WorkoutHistory onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Завершене/ }));
    expect(onNavigate).toHaveBeenCalledWith("workout/w-42");
  });

  it("shows the finished-count subtitle", () => {
    mockWorkouts.push(
      makeWorkout({ id: "w1" }),
      makeWorkout({ id: "w2", endedAt: null }),
    );
    renderWithToast(<WorkoutHistory onNavigate={vi.fn()} />);
    expect(screen.getByText(/Завершено:\s*1/)).toBeInTheDocument();
  });
});
