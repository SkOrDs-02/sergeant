// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Branch-coverage tests for useWorkoutsOrchestrator.ts.
 * Covers: removeItemWithUndo, handleExerciseInListClick (modes),
 * startWorkoutFromTemplate (empty/risky/safe), submitRetroWorkout,
 * handleQuickStartConfirm (strength/cardio), handleDeleteExerciseConfirm,
 * handleRiskyTemplateConfirm, addExerciseToActive, executeTemplateStart
 * with groups, finishedCount/recentWorkouts, mode derivation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ─── Storage ──────────────────────────────────────────────────────────────
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(() => null),
  safeWriteLS: vi.fn(),
  safeRemoveLS: vi.fn(),
  safeReadStringSS: vi.fn(() => null),
  safeRemoveSS: vi.fn(),
  safeReadLS: vi.fn(() => null),
  safeReadLSValidated: vi.fn(() => null),
  safeListLSKeys: vi.fn(() => []),
  webKVStore: { get: vi.fn(() => null), set: vi.fn(), remove: vi.fn() },
}));

vi.mock("@shared/lib/modules/cloudPullRequest", () => ({
  requestCloudPull: vi.fn(() => Promise.resolve()),
}));

const mockShowUndoToast = vi.fn();
vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: (toast: unknown, opts: unknown) =>
    mockShowUndoToast(toast, opts),
}));

// ─── useExerciseCatalog ───────────────────────────────────────────────────
type MockExercise = {
  id: string;
  primaryGroup: string;
  name: { uk: string; en: string };
  muscles: { primary: string[]; secondary: string[] };
  equipment: string[];
};

const mockExercises: MockExercise[] = [
  {
    id: "ex-chest-1",
    primaryGroup: "chest",
    name: { uk: "Жим лежачи", en: "Bench press" },
    muscles: { primary: ["pectoralis_major"], secondary: [] },
    equipment: ["barbell"],
  },
  {
    id: "ex-cardio-1",
    primaryGroup: "cardio",
    name: { uk: "Біг", en: "Running" },
    muscles: { primary: ["quadriceps"], secondary: [] },
    equipment: ["none"],
  },
];

const mockAddExercise = vi.fn();
const mockRemoveExercise = vi.fn(() => true);

vi.mock("./useExerciseCatalog", () => ({
  useExerciseCatalog: vi.fn(() => ({
    exercises: mockExercises,
    search: vi.fn((q: string) =>
      q ? mockExercises.filter((e) => e.name.uk.includes(q)) : mockExercises,
    ),
    primaryGroupsUk: { chest: "Груди", cardio: "Кардіо" },
    equipmentUk: { barbell: "Штанга" },
    musclesUk: { pectoralis_major: "Грудні", quadriceps: "Квадрицепс" },
    musclesByPrimaryGroup: {},
    addExercise: mockAddExercise,
    removeExercise: mockRemoveExercise,
  })),
}));

// ─── useRecovery ─────────────────────────────────────────────────────────
vi.mock("./useRecovery", () => ({
  useRecovery: vi.fn(() => ({ by: {}, logRecovery: vi.fn() })),
}));

// ─── useWorkoutTemplates ─────────────────────────────────────────────────
const mockMarkTemplateUsed = vi.fn();
vi.mock("./useWorkoutTemplates", () => ({
  useWorkoutTemplates: vi.fn(() => ({
    templates: [],
    addTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    markTemplateUsed: mockMarkTemplateUsed,
    updateTemplate: vi.fn(),
  })),
}));

// ─── useWorkouts ─────────────────────────────────────────────────────────
type SimpleWorkout = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items: unknown[];
  groups: unknown[];
  warmup: null;
  cooldown: null;
  note: string;
};

const mockWorkoutsList: SimpleWorkout[] = [];
const mockCreateWorkout = vi.fn(() => ({
  id: "w-new",
  startedAt: new Date().toISOString(),
  endedAt: null,
  items: [],
  groups: [],
  warmup: null,
  cooldown: null,
  note: "",
}));
const mockCreateWorkoutWithTimes = vi.fn(
  ({ startedAt }: { startedAt: string }) => ({
    id: "w-retro",
    startedAt,
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  }),
);
const mockUpdateWorkout = vi.fn();
const mockDeleteWorkout = vi.fn();
const mockRestoreWorkout = vi.fn();
const mockEndWorkout = vi.fn();
const mockAddItem = vi.fn(() => "item-id-1");
const mockUpdateItem = vi.fn();
const mockRemoveItem = vi.fn();

vi.mock("./useWorkouts", () => ({
  useWorkouts: vi.fn(() => ({
    workouts: mockWorkoutsList,
    loaded: true,
    createWorkout: mockCreateWorkout,
    createWorkoutWithTimes: mockCreateWorkoutWithTimes,
    updateWorkout: mockUpdateWorkout,
    deleteWorkout: mockDeleteWorkout,
    restoreWorkout: mockRestoreWorkout,
    endWorkout: mockEndWorkout,
    addItem: mockAddItem,
    updateItem: mockUpdateItem,
    removeItem: mockRemoveItem,
  })),
}));

// ─── useWorkoutsLifecycle ─────────────────────────────────────────────────
vi.mock("./useWorkoutsLifecycle", () => ({
  useActiveWorkoutIdPersistence: vi.fn(),
  useStaleActiveWorkoutCleanup: vi.fn(),
  useWorkoutsViewFromSession: vi.fn(),
  useLiveWorkoutTick: vi.fn(),
}));

// ─── RestTimerContext ─────────────────────────────────────────────────────
vi.mock("../context/RestTimerContext", () => ({
  RestTimerContext: {},
  useRestTimer: vi.fn(() => ({ restTimer: null, setRestTimer: vi.fn() })),
}));

// ─── @sergeant/fizruk-domain ─────────────────────────────────────────────
type ConflictResult = {
  hasWarning: boolean;
  hasHardBlock: boolean;
  red: { label: string }[];
  yellow: { label: string }[];
};

const mockRecoveryConflicts = vi.fn<
  (_ex?: unknown, _by?: unknown) => ConflictResult
>(() => ({
  hasWarning: false,
  hasHardBlock: false,
  red: [],
  yellow: [],
}));

vi.mock("@sergeant/fizruk-domain", () => ({
  ACTIVE_WORKOUT_KEY: "fizruk_active_workout",
  summarizeWorkoutForFinish: vi.fn((w: unknown) => w),
  recoveryConflictsForExercise: (ex: unknown, by: unknown) =>
    mockRecoveryConflicts(ex, by),
}));

// ─── useToast ────────────────────────────────────────────────────────────
const mockWarning = vi.fn();
const mockSuccess = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: vi.fn(() => ({
    warning: mockWarning,
    success: mockSuccess,
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

// ─── time ─────────────────────────────────────────────────────────────────
vi.mock("@shared/lib/time/kyivTime", () => ({
  getKyivDateParts: vi.fn(() => ({
    year: 2026,
    month: 7,
    day: 10,
    hour: 10,
    minute: 30,
  })),
  getKyivDayKey: vi.fn(() => "2026-07-10"),
}));

// ─── import under test ─────────────────────────────────────────────────────
import { useWorkoutsOrchestrator } from "./useWorkoutsOrchestrator";

// ─── Helpers ──────────────────────────────────────────────────────────────
function makeTpl(over: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    name: "My Template",
    exerciseIds: ["ex-chest-1"],
    groups: [],
    usedAt: null,
    ...over,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockWorkoutsList.length = 0;
  mockRecoveryConflicts.mockReturnValue({
    hasWarning: false,
    hasHardBlock: false,
    red: [],
    yellow: [],
  });
  mockCreateWorkout.mockReturnValue({
    id: "w-new",
    startedAt: new Date().toISOString(),
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  });
  mockAddItem.mockReturnValue("item-id-1");
  mockRemoveExercise.mockReturnValue(true);
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("useWorkoutsOrchestrator – initial state", () => {
  it("returns default shape", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    expect(result.current.workouts).toEqual([]);
    expect(result.current.workoutsLoaded).toBe(true);
    expect(result.current.view).toBe("home");
    expect(result.current.mode).toBe("catalog");
    expect(result.current.activeWorkout).toBeNull();
    expect(result.current.activeWorkoutId).toBeNull();
  });

  it("journalQuery reflects loaded state", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    expect(result.current.journalQuery.isLoading).toBe(false);
    expect(result.current.journalQuery.data).toBeDefined();
  });

  it("finishedCount is 0 when no workouts", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    expect(result.current.finishedCount).toBe(0);
  });

  it("recentWorkouts is empty when no workouts", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    expect(result.current.recentWorkouts).toEqual([]);
  });
});

describe("useWorkoutsOrchestrator – mode derivation", () => {
  it("mode is 'catalog' when view is 'home'", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    expect(result.current.mode).toBe("catalog");
  });

  it("mode is 'catalog' when view is 'templates'", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setView("templates"));
    expect(result.current.mode).toBe("catalog");
  });

  it("mode is 'log' when view is 'log'", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setView("log"));
    expect(result.current.mode).toBe("log");
  });
});

describe("useWorkoutsOrchestrator – handleExerciseInListClick", () => {
  it("sets selected when in catalog mode", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() =>
      result.current.handleExerciseInListClick(mockExercises[0] as never),
    );
    expect(result.current.selected).toEqual(mockExercises[0]);
  });

  it("shows warning when in log mode with no active workout", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setView("log"));
    act(() =>
      result.current.handleExerciseInListClick(mockExercises[0] as never),
    );
    expect(mockWarning).toHaveBeenCalled();
  });

  it("shows warning when active workout is ended", () => {
    mockWorkoutsList.push({
      id: "w-ended",
      startedAt: "2026-07-01T08:00:00Z",
      endedAt: "2026-07-01T09:00:00Z",
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    });
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setActiveWorkoutId("w-ended"));
    act(() => result.current.setView("log"));
    act(() =>
      result.current.handleExerciseInListClick(mockExercises[0] as never),
    );
    expect(mockWarning).toHaveBeenCalled();
  });
});

describe("useWorkoutsOrchestrator – removeItemWithUndo", () => {
  it("calls removeItem directly when workout not found", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.removeItemWithUndo("nonexistent-wid", "item-1"));
    expect(mockRemoveItem).toHaveBeenCalledWith("nonexistent-wid", "item-1");
  });

  it("calls removeItem and showUndoToast when workout found", () => {
    mockWorkoutsList.push({
      id: "w-1",
      startedAt: "2026-07-10T10:00:00Z",
      endedAt: null,
      items: [{ id: "item-1", exerciseId: "ex-chest-1", nameUk: "Жим" }],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    });
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.removeItemWithUndo("w-1", "item-1"));
    expect(mockRemoveItem).toHaveBeenCalledWith("w-1", "item-1");
    expect(mockShowUndoToast).toHaveBeenCalled();
  });
});

describe("useWorkoutsOrchestrator – startWorkoutFromTemplate", () => {
  it("shows warning when template exercises are not in catalog", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    const emptyTpl = makeTpl({ exerciseIds: ["nonexistent-ex"] });
    act(() => result.current.startWorkoutFromTemplate(emptyTpl as never));
    expect(mockWarning).toHaveBeenCalled();
    expect(mockCreateWorkout).not.toHaveBeenCalled();
  });

  it("executes template when exercises are safe", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    const tpl = makeTpl({ exerciseIds: ["ex-chest-1"] });
    act(() => result.current.startWorkoutFromTemplate(tpl as never));
    expect(mockCreateWorkout).toHaveBeenCalled();
    expect(mockMarkTemplateUsed).toHaveBeenCalledWith("tpl-1");
  });

  it("sets riskyTemplateConfirm when exercise has a recovery conflict", () => {
    mockRecoveryConflicts.mockReturnValueOnce({
      hasWarning: true,
      hasHardBlock: true,
      red: [],
      yellow: [],
    });
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    const riskyTpl = makeTpl({ id: "tpl-risky" });
    act(() => result.current.startWorkoutFromTemplate(riskyTpl as never));
    expect(result.current.riskyTemplateConfirm).toMatchObject({
      id: "tpl-risky",
    });
    expect(mockCreateWorkout).not.toHaveBeenCalled();
  });
});

describe("useWorkoutsOrchestrator – handleRiskyTemplateConfirm", () => {
  it("is a no-op when riskyTemplateConfirm is null", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.handleRiskyTemplateConfirm());
    expect(mockCreateWorkout).not.toHaveBeenCalled();
  });

  it("executes template after confirm", () => {
    mockRecoveryConflicts.mockReturnValueOnce({
      hasWarning: true,
      hasHardBlock: true,
      red: [],
      yellow: [],
    });
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    const riskyTpl = makeTpl({ id: "tpl-risky-confirm" });
    act(() => result.current.startWorkoutFromTemplate(riskyTpl as never));
    // confirm clears dialog and executes
    act(() => result.current.handleRiskyTemplateConfirm());
    expect(mockCreateWorkout).toHaveBeenCalled();
  });
});

describe("useWorkoutsOrchestrator – submitRetroWorkout", () => {
  it("creates a workout with startedAt from retroDate + retroTime", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.submitRetroWorkout());
    expect(mockCreateWorkoutWithTimes).toHaveBeenCalled();
    const arg = mockCreateWorkoutWithTimes.mock.calls[0]?.[0] as {
      startedAt: string;
    };
    expect(arg).toHaveProperty("startedAt");
    expect(typeof arg.startedAt).toBe("string");
  });

  it("closes retroOpen after submit", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setRetroOpen(true));
    expect(result.current.retroOpen).toBe(true);
    act(() => result.current.submitRetroWorkout());
    expect(result.current.retroOpen).toBe(false);
  });

  it("sets the new workout as active", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.submitRetroWorkout());
    expect(result.current.activeWorkoutId).toBe("w-retro");
  });
});

describe("useWorkoutsOrchestrator – handleQuickStartConfirm", () => {
  it("creates a workout and adds strength exercise", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() =>
      result.current.handleQuickStartConfirm([mockExercises[0] as never]),
    );
    expect(mockCreateWorkout).toHaveBeenCalled();
    expect(mockAddItem).toHaveBeenCalledWith(
      "w-new",
      expect.objectContaining({ type: "strength" }),
    );
    expect(result.current.quickStartOpen).toBe(false);
    expect(result.current.view).toBe("log");
  });

  it("adds distance type for cardio exercise", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() =>
      result.current.handleQuickStartConfirm([mockExercises[1] as never]),
    );
    expect(mockAddItem).toHaveBeenCalledWith(
      "w-new",
      expect.objectContaining({ type: "distance" }),
    );
  });
});

describe("useWorkoutsOrchestrator – handleDeleteExerciseConfirm", () => {
  it("is a no-op when no exercise is selected", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.handleDeleteExerciseConfirm());
    expect(mockRemoveExercise).not.toHaveBeenCalled();
    expect(result.current.deleteExerciseConfirm).toBe(false);
  });

  it("deletes selected exercise and shows undo toast", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setSelected(mockExercises[0] as never));
    act(() => result.current.handleDeleteExerciseConfirm());
    expect(mockRemoveExercise).toHaveBeenCalledWith("ex-chest-1");
    expect(mockShowUndoToast).toHaveBeenCalled();
    expect(result.current.selected).toBeNull();
    expect(result.current.deleteExerciseConfirm).toBe(false);
  });

  it("clears confirm even when removeExercise returns false", () => {
    mockRemoveExercise.mockReturnValueOnce(false);
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setSelected(mockExercises[0] as never));
    act(() => result.current.handleDeleteExerciseConfirm());
    expect(result.current.deleteExerciseConfirm).toBe(false);
    expect(mockShowUndoToast).not.toHaveBeenCalled();
  });
});

describe("useWorkoutsOrchestrator – addExerciseToActive", () => {
  it("does nothing when no activeWorkoutId", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.addExerciseToActive(mockExercises[0] as never));
    expect(mockAddItem).not.toHaveBeenCalled();
  });

  it("adds strength item when active workout is set", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setActiveWorkoutId("w-active"));
    act(() => result.current.addExerciseToActive(mockExercises[0] as never));
    expect(mockAddItem).toHaveBeenCalledWith(
      "w-active",
      expect.objectContaining({ type: "strength" }),
    );
  });

  it("adds distance item for cardio exercise", () => {
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.setActiveWorkoutId("w-active"));
    act(() => result.current.addExerciseToActive(mockExercises[1] as never));
    expect(mockAddItem).toHaveBeenCalledWith(
      "w-active",
      expect.objectContaining({ type: "distance" }),
    );
  });
});

describe("useWorkoutsOrchestrator – executeTemplateStart with groups", () => {
  it("calls updateWorkout with groups when template has a group with 2+ exercises", () => {
    let callCount = 0;
    mockAddItem.mockImplementation(() => {
      callCount++;
      return `item-${callCount}`;
    });
    const tpl = makeTpl({
      exerciseIds: ["ex-chest-1", "ex-cardio-1"],
      groups: [
        {
          id: "g1",
          type: "superset",
          exerciseIds: ["ex-chest-1", "ex-cardio-1"],
          restSec: 60,
        },
      ],
    });
    const { result } = renderHook(() => useWorkoutsOrchestrator());
    act(() => result.current.startWorkoutFromTemplate(tpl as never));
    expect(mockUpdateWorkout).toHaveBeenCalledWith(
      "w-new",
      expect.objectContaining({ groups: expect.any(Array) }),
    );
  });
});
