// @vitest-environment jsdom
/**
 * Extended tests for the Dashboard page — covers branches not exercised by
 * the base Dashboard.test.tsx:
 *   • Hydration skeleton when user is signed in + data still loading
 *   • Quick-start card when templates are available
 *   • RecentWorkoutsSection when completed workouts exist
 *   • Insight cards (PR-pending, rest-day)
 *   • Plan-confirm sheet (recovery conflict)
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// ── Stubs (same pattern as Dashboard.test.tsx) ───────────────────────────────

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

vi.mock("../../../core/auth/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

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

vi.mock("../components/dashboard/HeroCard", () => ({
  HeroCard: ({
    state,
    greeting,
    today,
    onResume,
    onStartToday,
    onOpenPlan,
    onOpenTemplates,
    onOpenPrograms,
    cornerSlot,
  }: {
    state: { kind: string };
    greeting: string;
    today: string;
    onResume: () => void;
    onStartToday: () => void;
    onOpenPlan: () => void;
    onOpenTemplates: () => void;
    onOpenPrograms: () => void;
    cornerSlot?: React.ReactNode;
  }) => (
    <div data-testid="hero-card" data-hero-kind={state.kind}>
      <span data-testid="hero-greeting">{greeting}</span>
      <span data-testid="hero-today">{today}</span>
      <button type="button" data-testid="hero-resume" onClick={onResume}>
        Resume
      </button>
      <button
        type="button"
        data-testid="hero-start-today"
        onClick={onStartToday}
      >
        Start
      </button>
      <button type="button" data-testid="hero-open-plan" onClick={onOpenPlan}>
        Plan
      </button>
      <button
        type="button"
        data-testid="hero-open-templates"
        onClick={onOpenTemplates}
      >
        Templates
      </button>
      <button
        type="button"
        data-testid="hero-open-programs"
        onClick={onOpenPrograms}
      >
        Programs
      </button>
      {cornerSlot}
    </div>
  ),
}));

vi.mock("../components/dashboard/StatusStrip", () => ({
  StatusStrip: ({
    onOpenBody,
    onOpenProgress,
    onOpenWorkouts,
  }: {
    kpis: unknown;
    recovery: unknown;
    onOpenBody: () => void;
    onOpenProgress: () => void;
    onOpenWorkouts: () => void;
  }) => (
    <div data-testid="status-strip">
      <button type="button" data-testid="status-open-body" onClick={onOpenBody}>
        Тіло
      </button>
      <button
        type="button"
        data-testid="status-open-progress"
        onClick={onOpenProgress}
      >
        Прогрес
      </button>
      <button
        type="button"
        data-testid="status-open-workouts"
        onClick={onOpenWorkouts}
      >
        Тренування
      </button>
    </div>
  ),
}));

vi.mock("../components/dashboard/RecentWorkoutsSection", () => ({
  RecentWorkoutsSection: ({
    recent,
    onSeeAll,
  }: {
    recent: unknown[];
    onSeeAll: () => void;
  }) => (
    <div data-testid="recent-workouts" data-count={recent.length}>
      <button type="button" onClick={onSeeAll}>
        Усі
      </button>
    </div>
  ),
}));

vi.mock("../components/dashboard/PrBadge", () => ({
  PrBadge: () => <div data-testid="pr-badge" />,
}));

// ── Imports under test ───────────────────────────────────────────────────────
import React from "react";
import { Dashboard } from "./Dashboard";
import { useAuth } from "../../../core/auth/AuthContext";
import { useWorkouts } from "../hooks/useWorkouts";
import { useWorkoutTemplates } from "../hooks/useWorkoutTemplates";
import { useRestDayOverdueInsight } from "../hooks/useRestDayOverdueInsight";
import { usePrPendingInsight } from "../hooks/usePrPendingInsight";
import { useActiveFizrukWorkout } from "@shared/hooks/useActiveFizrukWorkout";
import { useRecovery } from "../hooks/useRecovery";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";

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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-04T09:00:00+03:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard extended coverage", () => {
  it("renders a loading skeleton when signed-in user data is not yet loaded", () => {
    vi.mocked(useAuth).mockReturnValueOnce({ user: { id: "u1" } } as ReturnType<
      typeof useAuth
    >);
    vi.mocked(useWorkouts).mockReturnValueOnce({
      workouts: [],
      loaded: false,
      createWorkout: vi.fn(),
      addItem: vi.fn(),
    } as unknown as ReturnType<typeof useWorkouts>);

    render(<Dashboard {...defaultProps} />);

    // Skeleton root has aria-label="Завантаження дашборду"
    expect(screen.getByLabelText("Завантаження дашборду")).toBeInTheDocument();
    // HeroCard should NOT render while skeleton is shown
    expect(screen.queryByTestId("hero-card")).not.toBeInTheDocument();
  });

  it("renders skeleton when templates are still loading for signed-in user", () => {
    vi.mocked(useAuth).mockReturnValueOnce({ user: { id: "u1" } } as ReturnType<
      typeof useAuth
    >);
    vi.mocked(useWorkoutTemplates).mockReturnValueOnce({
      templates: [],
      loaded: false,
      recentlyUsed: [],
      markTemplateUsed: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutTemplates>);

    render(<Dashboard {...defaultProps} />);

    expect(screen.getByLabelText("Завантаження дашборду")).toBeInTheDocument();
  });

  it("renders the quick-start card when templates are available", () => {
    vi.mocked(useWorkoutTemplates).mockReturnValueOnce({
      templates: [
        {
          id: "tpl1",
          name: "Жим лежачи A",
          exerciseIds: [],
        },
      ] as unknown as ReturnType<typeof useWorkoutTemplates>["templates"],
      loaded: true,
      recentlyUsed: [],
      markTemplateUsed: vi.fn(),
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutTemplates>);

    render(<Dashboard {...defaultProps} />);

    // The Quick-start card is labelled "Швидкий старт"
    expect(screen.getByLabelText("Швидкий старт")).toBeInTheDocument();
    expect(screen.getByText("Жим лежачи A")).toBeInTheDocument();
  });

  it("shows 'Нещодавно використані' label when recentlyUsed templates exist", () => {
    const tpl = { id: "tpl1", name: "Присідання", exerciseIds: [] };
    vi.mocked(useWorkoutTemplates).mockReturnValueOnce({
      templates: [tpl] as unknown as ReturnType<
        typeof useWorkoutTemplates
      >["templates"],
      loaded: true,
      recentlyUsed: [tpl] as unknown as ReturnType<
        typeof useWorkoutTemplates
      >["recentlyUsed"],
      markTemplateUsed: vi.fn(),
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutTemplates>);

    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText("Нещодавно використані")).toBeInTheDocument();
  });

  it("shows 'Останні шаблони' label when recentlyUsed is empty", () => {
    const tpl = { id: "tpl1", name: "Планка", exerciseIds: [] };
    vi.mocked(useWorkoutTemplates).mockReturnValueOnce({
      templates: [tpl] as unknown as ReturnType<
        typeof useWorkoutTemplates
      >["templates"],
      loaded: true,
      recentlyUsed: [],
      markTemplateUsed: vi.fn(),
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutTemplates>);

    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText("Останні шаблони")).toBeInTheDocument();
  });

  it("renders the RecentWorkoutsSection when completed workouts exist", () => {
    vi.mocked(useWorkouts).mockReturnValueOnce({
      workouts: [
        {
          id: "w1",
          startedAt: "2026-06-01T10:00:00Z",
          endedAt: "2026-06-01T11:00:00Z",
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
      loaded: true,
      createWorkout: vi.fn(),
      addItem: vi.fn(),
    } as unknown as ReturnType<typeof useWorkouts>);

    render(<Dashboard {...defaultProps} />);

    expect(screen.getByTestId("recent-workouts")).toBeInTheDocument();
  });

  it("calls onNavigate('workouts') when RecentWorkoutsSection 'see all' is clicked", () => {
    vi.mocked(useWorkouts).mockReturnValueOnce({
      workouts: [
        {
          id: "w1",
          startedAt: "2026-06-01T10:00:00Z",
          endedAt: "2026-06-01T11:00:00Z",
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
      loaded: true,
      createWorkout: vi.fn(),
      addItem: vi.fn(),
    } as unknown as ReturnType<typeof useWorkouts>);

    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByText("Усі"));
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });

  it("renders an InsightCard when a PR-pending insight is active", () => {
    vi.mocked(usePrPendingInsight).mockReturnValueOnce({
      id: "pr-pending",
      module: "fizruk" as const,
      showOn: "module" as const,
      title: "Побий рекорд!",
      subtitle: "Завтра шанс для нового PR",
      action: { type: "navigate", path: "workouts" },
    });

    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText("Побий рекорд!")).toBeInTheDocument();
  });

  it("renders an InsightCard when a rest-day insight is active", () => {
    vi.mocked(useRestDayOverdueInsight).mockReturnValueOnce({
      id: "rest-day-overdue",
      module: "fizruk" as const,
      showOn: "module" as const,
      title: "День відпочинку",
      subtitle: "Ти тренуєшся 5 днів поспіль",
      action: { type: "navigate", path: "workouts" },
    });

    render(<Dashboard {...defaultProps} />);

    expect(screen.getByText("День відпочинку")).toBeInTheDocument();
  });

  it("sets hero state to 'active' when there is an active workout", () => {
    vi.mocked(useActiveFizrukWorkout).mockReturnValueOnce("w-active");
    vi.mocked(useWorkouts).mockReturnValueOnce({
      workouts: [
        {
          id: "w-active",
          startedAt: "2026-06-04T08:00:00Z",
          endedAt: null,
          items: [{ id: "i1" }],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
      loaded: true,
      createWorkout: vi.fn(),
      addItem: vi.fn(),
    } as unknown as ReturnType<typeof useWorkouts>);

    render(<Dashboard {...defaultProps} />);

    const hero = screen.getByTestId("hero-card");
    expect(hero.getAttribute("data-hero-kind")).toBe("active");
  });

  it("plan confirm sheet opens when tryStartPlan detects a recovery conflict", () => {
    // `recoveryConflictsForExercise` from @sergeant/fizruk-domain checks
    // `by[muscle].status === "red"`.  Set the mock values to match.
    vi.mocked(useExerciseCatalog).mockReturnValueOnce({
      exercises: [
        {
          id: "bench",
          name: { uk: "Жим лежачи", en: "Bench press" },
          primaryGroup: "chest",
          muscles: { primary: ["pec"], secondary: [] },
        },
      ],
      musclesUk: { pec: "Груди" },
    } as unknown as ReturnType<typeof useExerciseCatalog>);
    vi.mocked(useWorkoutTemplates).mockReturnValueOnce({
      templates: [
        { id: "tpl1", name: "Грудні", exerciseIds: ["bench"] },
      ] as unknown as ReturnType<typeof useWorkoutTemplates>["templates"],
      loaded: true,
      recentlyUsed: [],
      markTemplateUsed: vi.fn(),
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutTemplates>);
    // status "red" triggers hasWarning = true in recoveryConflictsForExercise
    vi.mocked(useRecovery).mockReturnValueOnce({
      by: {
        pec: {
          id: "pec",
          label: "Груди",
          status: "red" as const,
          lastAt: Date.now() - 86400000,
          daysSince: 1,
          load7d: 0,
          fatigue: 0,
        },
      } as ReturnType<typeof useRecovery>["by"],
      list: [],
      ready: [],
      avoid: [],
      wellbeingMult: 1,
    } as ReturnType<typeof useRecovery>);

    render(<Dashboard {...defaultProps} />);

    // Click the template button — recovery conflict → plan confirm sheet opens
    fireEvent.click(screen.getByText("Грудні"));

    // Sheet title "Увага" should appear
    expect(screen.getByText("Увага")).toBeInTheDocument();
    expect(screen.getByText("Скасувати")).toBeInTheDocument();
    expect(screen.getByText("Продовжити")).toBeInTheDocument();
  });
});

describe("Dashboard — navigation callbacks", () => {
  it("calls onNavigate('workouts') when StatusStrip opens workouts", () => {
    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId("status-open-workouts"));
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });

  it("calls onNavigate('progress') when StatusStrip opens progress", () => {
    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId("status-open-progress"));
    expect(mockNavigate).toHaveBeenCalledWith("progress");
  });

  it("calls onNavigate('body') when StatusStrip opens body", () => {
    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId("status-open-body"));
    expect(mockNavigate).toHaveBeenCalledWith("body");
  });

  it("calls onNavigate('workouts') via HeroCard resume button", () => {
    vi.mocked(useActiveFizrukWorkout).mockReturnValueOnce("w-active");
    vi.mocked(useWorkouts).mockReturnValueOnce({
      workouts: [
        {
          id: "w-active",
          startedAt: "2026-06-04T08:00:00Z",
          endedAt: null,
          items: [{ id: "i1" }],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
      loaded: true,
      createWorkout: vi.fn(),
      addItem: vi.fn(),
    } as unknown as ReturnType<typeof useWorkouts>);

    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId("hero-resume"));
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });

  it("calls onNavigate('workouts') via HeroCard open-plan button", () => {
    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId("hero-open-plan"));
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });

  it("closes the plan confirm sheet when Скасувати is clicked", () => {
    vi.mocked(useExerciseCatalog).mockReturnValueOnce({
      exercises: [
        {
          id: "bench",
          name: { uk: "Жим лежачи", en: "Bench press" },
          primaryGroup: "chest",
          muscles: { primary: ["pec"], secondary: [] },
        },
      ],
      musclesUk: { pec: "Груди" },
    } as unknown as ReturnType<typeof useExerciseCatalog>);
    vi.mocked(useWorkoutTemplates).mockReturnValueOnce({
      templates: [
        { id: "tpl1", name: "Грудні", exerciseIds: ["bench"] },
      ] as unknown as ReturnType<typeof useWorkoutTemplates>["templates"],
      loaded: true,
      recentlyUsed: [],
      markTemplateUsed: vi.fn(),
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutTemplates>);
    vi.mocked(useRecovery).mockReturnValueOnce({
      by: {
        pec: {
          id: "pec",
          label: "Груди",
          status: "red" as const,
          lastAt: Date.now() - 86400000,
          daysSince: 1,
          load7d: 0,
          fatigue: 0,
        },
      } as ReturnType<typeof useRecovery>["by"],
      list: [],
      ready: [],
      avoid: [],
      wellbeingMult: 1,
    } as ReturnType<typeof useRecovery>);

    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByText("Грудні"));
    // Sheet is now open
    expect(screen.getByText("Увага")).toBeInTheDocument();
    // Click Скасувати to dismiss
    fireEvent.click(screen.getByText("Скасувати"));
    // Sheet should be gone
    expect(screen.queryByText("Увага")).not.toBeInTheDocument();
  });

  it("calls onNavigate('workouts') when InsightCard is activated", () => {
    vi.mocked(usePrPendingInsight).mockReturnValueOnce({
      id: "pr-pending",
      module: "fizruk" as const,
      showOn: "module" as const,
      title: "Побий рекорд!",
      subtitle: "Завтра шанс для нового PR",
      action: { type: "navigate", path: "workouts" },
    });

    render(<Dashboard {...defaultProps} />);
    // The InsightCard activate button wraps title + subtitle text.
    // Clicking the title fires onActivate → onNavigate("workouts").
    fireEvent.click(screen.getByText("Побий рекорд!"));
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });

  it("calls onNavigate('workouts') via openTemplates (hero-open-templates)", () => {
    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByTestId("hero-open-templates"));
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });
});

describe("Dashboard — Продовжити confirm flow", () => {
  function setupRecoveryConflict() {
    vi.mocked(useExerciseCatalog).mockReturnValueOnce({
      exercises: [
        {
          id: "squat",
          name: { uk: "Присідання", en: "Squat" },
          primaryGroup: "quads",
          muscles: { primary: ["quad"], secondary: [] },
        },
      ],
      musclesUk: { quad: "Квадрицепс" },
    } as unknown as ReturnType<typeof useExerciseCatalog>);
    vi.mocked(useWorkoutTemplates).mockReturnValueOnce({
      templates: [
        { id: "leg-day", name: "Ноги", exerciseIds: ["squat"] },
      ] as unknown as ReturnType<typeof useWorkoutTemplates>["templates"],
      loaded: true,
      recentlyUsed: [],
      markTemplateUsed: vi.fn(),
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
    } as unknown as ReturnType<typeof useWorkoutTemplates>);
    vi.mocked(useRecovery).mockReturnValueOnce({
      by: {
        quad: {
          id: "quad",
          label: "Квадрицепс",
          status: "red" as const,
          lastAt: Date.now() - 86400000,
          daysSince: 1,
          load7d: 0,
          fatigue: 0,
        },
      } as ReturnType<typeof useRecovery>["by"],
      list: [],
      ready: [],
      avoid: [],
      wellbeingMult: 1,
    } as ReturnType<typeof useRecovery>);
  }

  it("clicking Продовжити in confirm sheet navigates to workouts and closes sheet", () => {
    const createWorkout = vi.fn(() => ({ id: "w-new", items: [] }));
    const addItem = vi.fn();
    // Use mockReturnValue (not Once) so re-renders after state changes also get the right createWorkout
    vi.mocked(useWorkouts).mockReturnValue({
      workouts: [],
      loaded: true,
      createWorkout: createWorkout as unknown as ReturnType<
        typeof useWorkouts
      >["createWorkout"],
      addItem,
    } as unknown as ReturnType<typeof useWorkouts>);
    setupRecoveryConflict();

    render(<Dashboard {...defaultProps} />);
    fireEvent.click(screen.getByText("Ноги"));
    expect(screen.getByText("Увага")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Продовжити"));

    // Sheet closes
    expect(screen.queryByText("Увага")).not.toBeInTheDocument();
    // Navigates to workouts
    expect(mockNavigate).toHaveBeenCalledWith("workouts");
  });
});

describe("Dashboard — program primaryAction hero state", () => {
  it("calls onStartProgramWorkout when handleStartPrimary is triggered with a program", () => {
    const onStartProgramWorkout = vi.fn();
    const activeProgram = {
      name: "Сила А",
      sessions: {
        day1: {
          name: "День 1",
          exerciseIds: ["bench"],
        },
      },
    } as unknown as import("@sergeant/fizruk-domain/domain").TrainingProgramDef;
    const todaySession = { sessionKey: "day1", name: "День 1" };

    render(
      <Dashboard
        {...defaultProps}
        onStartProgramWorkout={onStartProgramWorkout}
        activeProgram={activeProgram}
        todaySession={todaySession}
      />,
    );
    fireEvent.click(screen.getByTestId("hero-start-today"));
    expect(onStartProgramWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ name: "День 1" }),
      activeProgram,
    );
  });
});
