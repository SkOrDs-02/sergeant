// @vitest-environment jsdom
/**
 * Smoke tests for the Workouts page.
 * Mounts the page with mocked hooks to verify key elements render
 * and no crash occurs on mount.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";

// Stub kvStoreBoot (requires @sergeant/db-schema/sqlite WASM artefact)
vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

// Mock the entire orchestrator — it chains dozens of hooks and reads from
// SQLite, localStorage, context providers. A page-level smoke test should
// not re-exercise the orchestrator's logic.
vi.mock("../hooks/useWorkoutsOrchestrator", () => ({
  useWorkoutsOrchestrator: () => ({
    view: "home" as const,
    mode: "catalog" as const,
    setView: vi.fn(),
    activeWorkout: null,
    activeDuration: null,
    recentWorkouts: [],
    finishedCount: 0,
    workouts: [],
    journalQuery: { status: "success" as const },
    exercises: [],
    search: vi.fn(() => []),
    primaryGroupsUk: {},
    equipmentUk: {},
    musclesUk: {},
    musclesByPrimaryGroup: {},
    q: "",
    setQ: vi.fn(),
    equipmentFilter: [],
    setEquipmentFilter: vi.fn(),
    grouped: [],
    open: {},
    setOpen: vi.fn(),
    addOpen: false,
    setAddOpen: vi.fn(),
    quickStartOpen: false,
    setQuickStartOpen: vi.fn(),
    activeWorkoutId: null,
    setActiveWorkoutId: vi.fn(),
    selected: null,
    setSelected: vi.fn(),
    finishFlash: null,
    setFinishFlash: vi.fn(),
    deleteExerciseConfirm: false,
    setDeleteExerciseConfirm: vi.fn(),
    riskyTemplateConfirm: null,
    setRiskyTemplateConfirm: vi.fn(),
    retroOpen: false,
    setRetroOpen: vi.fn(),
    retroDate: "2026-06-04",
    setRetroDate: vi.fn(),
    retroTime: "18:00",
    setRetroTime: vi.fn(),
    form: {
      nameUk: "",
      primaryGroup: "chest",
      musclesPrimary: [],
      musclesSecondary: [],
      equipment: ["bodyweight"],
      description: "",
    },
    setForm: vi.fn(),
    rec: { by: {}, list: [], ready: [], avoid: [], wellbeingMult: 1 },
    lastByExerciseId: {},
    templateApi: {
      templates: [],
      recentlyUsed: [],
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      restoreTemplate: vi.fn(),
      markTemplateUsed: vi.fn(),
    },
    toast: {
      info: vi.fn(),
      warning: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
    },
    createWorkout: vi.fn(() => ({
      id: "w1",
      startedAt: new Date().toISOString(),
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    })),
    createWorkoutWithTimes: vi.fn(),
    updateWorkout: vi.fn(),
    deleteWorkout: vi.fn(),
    restoreWorkout: vi.fn(),
    endWorkout: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    removeItemWithUndo: vi.fn(),
    addExercise: vi.fn(),
    handleExerciseInListClick: vi.fn(),
    handlePullRefresh: vi.fn(),
    handleQuickStartConfirm: vi.fn(),
    startWorkoutFromTemplate: vi.fn(),
    addExerciseToActive: vi.fn(),
    recoveryConflictsForExercise: vi.fn(() => ({
      hasWarning: false,
      conflicts: [],
    })),
    submitRetroWorkout: vi.fn(),
    handleDeleteExerciseConfirm: vi.fn(),
    handleRiskyTemplateConfirm: vi.fn(),
    summarizeWorkoutForFinish: vi.fn(),
    setRestTimer: vi.fn(),
    restTimer: null,
  }),
}));

vi.mock("@shared/hooks/useCloudPullPending", () => ({
  useCloudPullPending: () => false,
}));

// RestTimerContext is used deep in the tree; provide a minimal stub
vi.mock("../context/RestTimerContext", () => ({
  useRestTimer: () => ({ restTimer: null, setRestTimer: vi.fn() }),
}));

import { Workouts } from "./Workouts";

// The page mounts AddExerciseSheet, which calls useToast() — wrap every
// render in a ToastProvider so the hook resolves its context.
const renderWorkouts = () =>
  render(
    <ToastProvider>
      <Workouts />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Workouts page smoke tests", () => {
  it("mounts without crashing in home view", () => {
    expect(() => renderWorkouts()).not.toThrow();
  });

  it("renders the WorkoutsHome default state (no active workout)", () => {
    renderWorkouts();
    expect(screen.getByText("Немає активного тренування")).toBeInTheDocument();
  });

  it("renders the 'Почати тренування' button in home view", () => {
    renderWorkouts();
    expect(
      screen.getByRole("button", { name: /Почати тренування/i }),
    ).toBeInTheDocument();
  });

  it("renders the 'Внести проведене заняття' retro button", () => {
    renderWorkouts();
    expect(
      screen.getByRole("button", { name: /Внести проведене заняття/i }),
    ).toBeInTheDocument();
  });

  it("renders recent workouts section", () => {
    renderWorkouts();
    expect(screen.getByLabelText("Останні тренування")).toBeInTheDocument();
  });
});
