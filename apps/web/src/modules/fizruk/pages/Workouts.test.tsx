// @vitest-environment jsdom
/**
 * Tests for the Workouts page — the main workouts orchestration surface.
 * Heavy sub-components and the orchestrator hook are stubbed so the tests
 * stay focused on view-switching logic and prop wiring, not internals.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── Stubs ────────────────────────────────────────────────────────────────────

vi.mock("../hooks/useWorkoutsOrchestrator", () => ({
  useWorkoutsOrchestrator: vi.fn(),
}));

vi.mock("@shared/hooks/useCloudPullPending", () => ({
  useCloudPullPending: vi.fn(() => false),
}));

vi.mock("@shared/components/ui/PullToRefresh", () => ({
  PullToRefresh: ({
    children,
    onRefresh,
  }: {
    children: React.ReactNode;
    onRefresh: () => void;
  }) => (
    <div data-testid="pull-to-refresh" onScroll={onRefresh}>
      {children}
    </div>
  ),
}));

vi.mock("../components/workouts/WorkoutsHeader", () => ({
  WorkoutsHeader: ({
    view,
    onBack,
    onAddCatalog,
  }: {
    view: string;
    onBack: () => void;
    onAddCatalog: () => void;
  }) => (
    <div data-testid="workouts-header" data-view={view}>
      <button type="button" onClick={onBack} data-testid="back-btn">
        Назад
      </button>
      <button
        type="button"
        onClick={onAddCatalog}
        data-testid="add-catalog-btn"
      >
        Додати
      </button>
    </div>
  ),
}));

vi.mock("../components/workouts/WorkoutsHome", () => ({
  WorkoutsHome: ({
    onOpenSession,
    onOpenCatalog,
    onOpenTemplates,
  }: {
    onOpenSession: () => void;
    onOpenCatalog: () => void;
    onOpenTemplates: () => void;
  }) => (
    <div data-testid="workouts-home">
      <button type="button" onClick={onOpenSession} data-testid="open-session">
        Журнал
      </button>
      <button type="button" onClick={onOpenCatalog} data-testid="open-catalog">
        Каталог
      </button>
      <button
        type="button"
        onClick={onOpenTemplates}
        data-testid="open-templates"
      >
        Шаблони
      </button>
    </div>
  ),
}));

vi.mock("../components/workouts/WorkoutJournalSection", () => ({
  WorkoutJournalSection: () => <div data-testid="workout-journal-section" />,
}));

vi.mock("../components/workouts/WorkoutCatalogSection", () => ({
  WorkoutCatalogSection: () => <div data-testid="workout-catalog-section" />,
}));

vi.mock("../components/WorkoutTemplatesSection", () => ({
  WorkoutTemplatesSection: () => (
    <div data-testid="workout-templates-section" />
  ),
}));

vi.mock("../components/workouts/ExerciseDetailSheet", () => ({
  ExerciseDetailSheet: () => null,
}));

vi.mock("../components/workouts/AddExerciseSheet", () => ({
  AddExerciseSheet: () => null,
}));

vi.mock("../components/workouts/QuickStartSheet", () => ({
  QuickStartSheet: () => null,
}));

vi.mock("../components/workouts/WorkoutFinishSheets", () => ({
  WorkoutFinishSheets: () => null,
}));

vi.mock("../components/workouts/WorkoutsConfirmDialogs", () => ({
  WorkoutsConfirmDialogs: () => null,
}));

vi.mock("@shared/components/ui/DataState", () => ({
  DataState: ({
    children,
  }: {
    children: () => React.ReactNode;
    query: unknown;
    skeleton: React.ReactNode;
  }) => <>{children()}</>,
}));

vi.mock("@shared/components/ui/Skeleton", () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { useWorkoutsOrchestrator } from "../hooks/useWorkoutsOrchestrator";
import { Workouts } from "./Workouts";

const mockedOrchestrator = vi.mocked(useWorkoutsOrchestrator);

function makeOrchestrator(view: string = "home", overrides: object = {}) {
  return {
    view,
    mode: view === "log" ? "log" : "catalog",
    activeWorkout: null,
    activeDuration: 0,
    recentWorkouts: [],
    workouts: [],
    activeWorkoutId: null,
    finishedCount: 0,
    journalQuery: {},
    q: "",
    setQ: vi.fn(),
    equipmentFilter: [],
    setEquipmentFilter: vi.fn(),
    equipmentUk: {},
    grouped: [],
    open: {},
    setOpen: vi.fn(),
    selected: null,
    addOpen: false,
    quickStartOpen: false,
    retroOpen: false,
    retroDate: "",
    setRetroDate: vi.fn(),
    retroTime: "",
    setRetroTime: vi.fn(),
    finishFlash: null,
    setFinishFlash: vi.fn(),
    toast: vi.fn(),
    form: {
      nameUk: "",
      primaryGroup: "",
      musclesPrimary: [],
      musclesSecondary: [],
      equipment: [],
      description: "",
    },
    setForm: vi.fn(),
    exercises: [],
    search: [],
    musclesUk: {},
    primaryGroupsUk: {},
    musclesByPrimaryGroup: {},
    rec: { by: {} },
    lastByExerciseId: {},
    deleteExerciseConfirm: false,
    riskyTemplateConfirm: null,
    setView: vi.fn(),
    setAddOpen: vi.fn(),
    setQuickStartOpen: vi.fn(),
    setRetroOpen: vi.fn(),
    setDeleteExerciseConfirm: vi.fn(),
    setRiskyTemplateConfirm: vi.fn(),
    setActiveWorkoutId: vi.fn(),
    setSelected: vi.fn(),
    createWorkout: vi.fn(),
    endWorkout: vi.fn(),
    updateWorkout: vi.fn(),
    updateItem: vi.fn(),
    removeItemWithUndo: vi.fn(),
    addItem: vi.fn(),
    addExercise: vi.fn(),
    addExerciseToActive: vi.fn(),
    handleExerciseInListClick: vi.fn(),
    handlePullRefresh: vi.fn(),
    handleDeleteExerciseConfirm: vi.fn(),
    handleRiskyTemplateConfirm: vi.fn(),
    handleQuickStartConfirm: vi.fn(),
    startWorkoutFromTemplate: vi.fn(),
    summarizeWorkoutForFinish: vi.fn(),
    submitRetroWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    setRestTimer: vi.fn(),
    workoutsLoaded: true,
    restTimer: null,
    now: Date.now(),
    recoveryConflictsForExercise: vi.fn(() => ({
      hasWarning: false,
      hasHardBlock: false,
      red: [],
      yellow: [],
    })),
    templateApi: {
      templates: [],
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Workouts page — home view", () => {
  beforeEach(() => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home") as unknown as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
  });

  it("renders WorkoutsHome in home view", () => {
    render(<Workouts />);
    expect(screen.getByTestId("workouts-home")).toBeInTheDocument();
  });

  it("does not render journal or catalog sections in home view", () => {
    render(<Workouts />);
    expect(
      screen.queryByTestId("workout-journal-section"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("workout-catalog-section"),
    ).not.toBeInTheDocument();
  });
});

describe("Workouts page — log view", () => {
  beforeEach(() => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("log") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
  });

  it("renders journal and catalog sections in log view", () => {
    render(<Workouts />);
    expect(screen.getByTestId("workout-journal-section")).toBeInTheDocument();
    expect(screen.getByTestId("workout-catalog-section")).toBeInTheDocument();
  });

  it("does not render WorkoutsHome in log view", () => {
    render(<Workouts />);
    expect(screen.queryByTestId("workouts-home")).not.toBeInTheDocument();
  });
});

describe("Workouts page — catalog view", () => {
  beforeEach(() => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("catalog") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
  });

  it("renders catalog section in catalog view", () => {
    render(<Workouts />);
    expect(screen.getByTestId("workout-catalog-section")).toBeInTheDocument();
  });

  it("does not render journal section in catalog view", () => {
    render(<Workouts />);
    expect(
      screen.queryByTestId("workout-journal-section"),
    ).not.toBeInTheDocument();
  });
});

describe("Workouts page — templates view", () => {
  beforeEach(() => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("templates") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
  });

  it("renders templates section in templates view", () => {
    render(<Workouts />);
    expect(screen.getByTestId("workout-templates-section")).toBeInTheDocument();
  });
});

describe("Workouts page — header wiring", () => {
  it("passes view prop to WorkoutsHeader", () => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("log") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    render(<Workouts />);
    expect(screen.getByTestId("workouts-header")).toHaveAttribute(
      "data-view",
      "log",
    );
  });

  it("back button calls setView('home')", () => {
    const setView = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("log", { setView }) as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    render(<Workouts />);
    fireEvent.click(screen.getByTestId("back-btn"));
    expect(setView).toHaveBeenCalledWith("home");
  });

  it("add catalog button calls setAddOpen(true)", () => {
    const setAddOpen = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", { setAddOpen }) as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    render(<Workouts />);
    fireEvent.click(screen.getByTestId("add-catalog-btn"));
    expect(setAddOpen).toHaveBeenCalledWith(true);
  });
});

describe("Workouts page — home action wiring", () => {
  it("'open-session' button sets view to 'log'", () => {
    const setView = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", { setView }) as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    render(<Workouts />);
    fireEvent.click(screen.getByTestId("open-session"));
    expect(setView).toHaveBeenCalledWith("log");
  });

  it("'open-catalog' button sets view to 'catalog'", () => {
    const setView = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", { setView }) as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    render(<Workouts />);
    fireEvent.click(screen.getByTestId("open-catalog"));
    expect(setView).toHaveBeenCalledWith("catalog");
  });

  it("'open-templates' button sets view to 'templates'", () => {
    const setView = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", { setView }) as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    render(<Workouts />);
    fireEvent.click(screen.getByTestId("open-templates"));
    expect(setView).toHaveBeenCalledWith("templates");
  });
});
