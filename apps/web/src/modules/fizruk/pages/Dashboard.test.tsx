// @vitest-environment jsdom
/**
 * Smoke tests for the Dashboard page.
 * Mounts with mocked hooks; verifies key sections render and CTAs fire.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Stub kvStoreBoot (requires @sergeant/db-schema/sqlite WASM artefact)
vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

// Stub useAuth — the Dashboard reads `user?.id` to gate the hydration
// skeleton (signed-in only). Guest (user: null) skips the skeleton and
// renders the body, which is what these smoke tests assert.
vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

// Stub all the hooks the Dashboard wires up
vi.mock("../hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: vi.fn(() => ({
    exercises: [],
    musclesUk: {},
  })),
}));

vi.mock("../hooks/useWorkouts", () => ({
  useWorkouts: vi.fn(() => ({
    workouts: [],
    loaded: true,
    createWorkout: vi.fn(),
    addItem: vi.fn(),
  })),
}));

vi.mock("../hooks/useRecovery", () => ({
  useRecovery: vi.fn(() => ({
    by: {},
    list: [],
    ready: [],
    avoid: [],
    wellbeingMult: 1,
  })),
}));

vi.mock("../hooks/useWorkoutTemplates", () => ({
  useWorkoutTemplates: vi.fn(() => ({
    templates: [],
    loaded: true,
    recentlyUsed: [],
    markTemplateUsed: vi.fn(),
  })),
}));

vi.mock("../hooks/useMonthlyPlan", () => ({
  useMonthlyPlan: vi.fn(() => ({
    days: [],
    todayTemplateId: null,
    reminderEnabled: false,
    reminderHour: 8,
    reminderMinute: 0,
  })),
}));

vi.mock("../hooks/useMeasurements", () => ({
  useMeasurements: vi.fn(() => ({
    entries: [],
  })),
}));

vi.mock("../hooks/useRestDayOverdueInsight", () => ({
  useRestDayOverdueInsight: vi.fn(() => null),
}));

vi.mock("../hooks/usePrPendingInsight", () => ({
  usePrPendingInsight: vi.fn(() => null),
}));

vi.mock("../hooks/usePrLatest", () => ({
  usePrLatest: vi.fn(() => null),
}));

vi.mock("@shared/hooks/useActiveFizrukWorkout", () => ({
  useActiveFizrukWorkout: vi.fn(() => null),
}));

// Stub HeroCard — isolate Dashboard layout from HeroCard details
vi.mock("../components/dashboard/HeroCard", () => ({
  HeroCard: ({
    greeting,
    today,
  }: {
    greeting: string;
    today: string;
    state: unknown;
    onResume: () => void;
    onStartToday: () => void;
    onOpenPlan: () => void;
    onOpenTemplates: () => void;
    onOpenPrograms: () => void;
    cornerSlot?: React.ReactNode;
  }) => (
    <div data-testid="hero-card">
      <span data-testid="hero-greeting">{greeting}</span>
      <span data-testid="hero-today">{today}</span>
    </div>
  ),
}));

vi.mock("../components/dashboard/StatusStrip", () => ({
  StatusStrip: () => <div data-testid="status-strip" />,
}));

vi.mock("../components/dashboard/RecentWorkoutsSection", () => ({
  RecentWorkoutsSection: () => <div data-testid="recent-workouts" />,
}));

vi.mock("../components/dashboard/PrBadge", () => ({
  PrBadge: () => <div data-testid="pr-badge" />,
}));

import React from "react";
import { Dashboard } from "./Dashboard";

const mockNavigate = vi.fn();

const defaultProps = {
  onOpenPrograms: vi.fn(),
  activeProgram: null,
  todaySession: null,
  onStartProgramWorkout: vi.fn(),
  onNavigate: mockNavigate,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  // Freeze time to a specific Kyiv morning for deterministic greeting
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-04T09:00:00+03:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard page smoke tests", () => {
  it("mounts without crashing", () => {
    expect(() => render(<Dashboard {...defaultProps} />)).not.toThrow();
  });

  it("renders the HeroCard", () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByTestId("hero-card")).toBeInTheDocument();
  });

  it("renders a greeting based on time of day", () => {
    render(<Dashboard {...defaultProps} />);
    const greeting = screen.getByTestId("hero-greeting");
    // 09:00 Kyiv → morning greeting
    expect(greeting.textContent).toBe("Доброго ранку");
  });

  it("renders today's date string", () => {
    render(<Dashboard {...defaultProps} />);
    const today = screen.getByTestId("hero-today");
    expect(today.textContent).not.toBe("");
  });

  it("renders the StatusStrip", () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByTestId("status-strip")).toBeInTheDocument();
  });

  it("does not render RecentWorkoutsSection when no completed workouts", () => {
    render(<Dashboard {...defaultProps} />);
    // recentWorkouts is [] → section should be hidden
    expect(screen.queryByTestId("recent-workouts")).not.toBeInTheDocument();
  });
});
