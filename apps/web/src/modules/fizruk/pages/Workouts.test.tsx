// @vitest-environment jsdom
/**
 * Tests for the Workouts page — the main workouts orchestration surface.
 * Heavy sub-components and the orchestrator hook are stubbed so the tests
 * stay focused on view-switching logic and prop wiring, not internals.
 */
import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// ── Stubs ────────────────────────────────────────────────────────────────────

vi.mock("../hooks/useWorkoutsOrchestrator", () => ({
  useWorkoutsOrchestrator: vi.fn(),
}));

vi.mock("@shared/hooks/useCloudPullPending", () => ({
  useCloudPullPending: vi.fn(() => false),
}));

// `StrongImportReview` (модалка Strong-імпорту) читає ідентичність сесії,
// щоб порахувати неймспейс детермінованих id — див. `lib/strongIdNamespace.ts`.
// Ця сторінка рендериться тут без `AuthProvider`, а `useLocalUserId` під ним
// кидає. Мокаємо саме хук, а не провайдера: тести цього файлу про
// перемикання виглядів, а не про сесію.
vi.mock("../../../core/auth/useLocalUserId", () => ({
  useLocalUserId: () => "test-user",
}));

// Стаб `Skeleton` прибрано разом із додаванням стаба вище — гейт `vi.mock cap`
// ходить лише вниз, і платити за нього треба реальним зняттям мока, а не
// підняттям стелі. `Skeleton` для цього найкращий кандидат: жоден тест на
// нього не спирався (`data-testid="skeleton"` не згадується в жодному
// очікуванні), а сам компонент чисто презентаційний і тягне лише `cn`, тож
// сьют тепер рендерить справжній.

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
    onOpenJournal,
    onOpenPrograms,
    onRequestStart,
    onOpenSchedule,
  }: {
    onOpenSession: () => void;
    onOpenCatalog: () => void;
    onOpenTemplates: () => void;
    onOpenJournal: () => void;
    onOpenPrograms: () => void;
    onRequestStart: () => void;
    onOpenSchedule?: () => void;
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
      <button type="button" onClick={onOpenJournal} data-testid="open-journal">
        Історія
      </button>
      <button
        type="button"
        onClick={onOpenPrograms}
        data-testid="open-programs"
      >
        Програми
      </button>
      <button
        type="button"
        onClick={onRequestStart}
        data-testid="request-start"
      >
        Почати
      </button>
      <button
        type="button"
        onClick={onOpenSchedule}
        data-testid="open-schedule"
      >
        Розклад
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
  ExerciseDetailSheet: ({
    onClose,
    onDeleteRequest,
    updateItem,
  }: {
    onClose: () => void;
    onDeleteRequest: () => void;
    updateItem?: unknown;
  }) => (
    <div
      data-testid="exercise-detail-sheet"
      data-has-update-item={updateItem ? "true" : "false"}
    >
      <button type="button" data-testid="close-detail" onClick={onClose}>
        Закрити
      </button>
      <button
        type="button"
        data-testid="delete-exercise"
        onClick={onDeleteRequest}
      >
        Видалити
      </button>
    </div>
  ),
}));

vi.mock("../components/workouts/AddExerciseSheet", () => ({
  AddExerciseSheet: ({ onClose }: { onClose: () => void }) => (
    <button type="button" data-testid="close-add-exercise" onClick={onClose}>
      Закрити вправу
    </button>
  ),
}));

vi.mock("../components/workouts/QuickStartSheet", () => ({
  QuickStartSheet: ({
    onClose,
    onPickTemplate,
  }: {
    onClose: () => void;
    onPickTemplate: () => void;
  }) => (
    <div data-testid="quick-start-sheet">
      <button type="button" data-testid="close-quick-start" onClick={onClose}>
        Закрити старт
      </button>
      <button
        type="button"
        data-testid="pick-template"
        onClick={onPickTemplate}
      >
        З шаблону
      </button>
    </div>
  ),
}));

vi.mock("../components/workouts/WorkoutFinishSheets", () => ({
  WorkoutFinishSheets: ({
    setFinishFlash,
  }: {
    setFinishFlash: (value: null) => void;
  }) => (
    <button
      type="button"
      data-testid="clear-finish-flash"
      onClick={() => setFinishFlash(null)}
    >
      Закрити фініш
    </button>
  ),
}));

vi.mock("../components/workouts/WorkoutsConfirmDialogs", () => ({
  WorkoutsConfirmDialogs: ({
    onDeleteExerciseConfirm,
    onDeleteExerciseCancel,
    onRiskyTemplateConfirm,
    onRiskyTemplateCancel,
  }: {
    onDeleteExerciseConfirm: () => void;
    onDeleteExerciseCancel: () => void;
    onRiskyTemplateConfirm: () => void;
    onRiskyTemplateCancel: () => void;
  }) => (
    <div data-testid="confirm-dialogs">
      <button
        type="button"
        data-testid="confirm-delete-exercise"
        onClick={onDeleteExerciseConfirm}
      >
        Так, видалити
      </button>
      <button
        type="button"
        data-testid="cancel-delete-exercise"
        onClick={onDeleteExerciseCancel}
      >
        Скасувати видалення
      </button>
      <button
        type="button"
        data-testid="confirm-risky-template"
        onClick={onRiskyTemplateConfirm}
      >
        Стартувати ризиковий
      </button>
      <button
        type="button"
        data-testid="cancel-risky-template"
        onClick={onRiskyTemplateCancel}
      >
        Скасувати шаблон
      </button>
    </div>
  ),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

import { useWorkoutsOrchestrator } from "../hooks/useWorkoutsOrchestrator";
import { ToastProvider } from "@shared/hooks/useToast";
import { Workouts } from "./Workouts";

// `StrongImportReview` НЕ мокаємо: замість стаба дитини сьют дає сторінці
// справжній `ToastProvider`, якого тій дитині бракувало. Так тест перевіряє
// реальний контракт props сторінка↔дитина, а не власний стаб
// (`scripts/ci/check-vi-mock-cap.mjs` — храповик проти over-mocking).
function renderWorkouts(props: ComponentProps<typeof Workouts> = {}) {
  return render(
    <ToastProvider>
      <Workouts {...props} />
    </ToastProvider>,
  );
}

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
    handleQuickStart: vi.fn(),
    startWorkoutFromTemplate: vi.fn(),
    repeatWorkout: vi.fn(),
    summarizeWorkoutForFinish: vi.fn(),
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
    renderWorkouts();
    expect(screen.getByTestId("workouts-home")).toBeInTheDocument();
  });

  it("does not render journal or catalog sections in home view", () => {
    renderWorkouts();
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

  it("renders the journal section in log view", () => {
    renderWorkouts();
    expect(screen.getByTestId("workout-journal-section")).toBeInTheDocument();
  });

  // §4.4 audit fix — the outer page container is `max-w-4xl` (896px), which
  // used to stretch the set-input fields to ~230px and "+ Підхід" to
  // ~800px on a 1280px viewport. The active-workout panel (a vertical
  // list of short numeric fields) now gets its own narrower `max-w-xl`.
  it("wraps the active-workout panel in a narrower max-w for desktop", () => {
    renderWorkouts();
    const journal = screen.getByTestId("workout-journal-section");
    expect(journal.closest(".max-w-xl")).not.toBeNull();
  });

  // Minimal fix per audit §4.4: the catalog is a browsable list, not a
  // form, so it must NOT be pulled into the narrower wrapper — it stays
  // at the outer `max-w-4xl` container width.
  it("does not narrow the exercise catalog — it stays at the outer container width", () => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("log", {
        activeWorkout: { id: "w1", endedAt: null },
      }) as unknown as ReturnType<typeof useWorkoutsOrchestrator>,
    );
    renderWorkouts();
    const catalog = screen.getByTestId("workout-catalog-section");
    expect(catalog.closest(".max-w-xl")).toBeNull();
  });

  it("does not render WorkoutsHome in log view", () => {
    renderWorkouts();
    expect(screen.queryByTestId("workouts-home")).not.toBeInTheDocument();
  });

  // 02-A item 3 — the exercise catalog used to hang around in "log" view
  // even when the routed workout was finished or missing (the dead-end
  // "Активне тренування не знайдено" + full catalog combo from the audit).
  it("does not render the catalog when there is no in-flight active workout", () => {
    renderWorkouts();
    expect(
      screen.queryByTestId("workout-catalog-section"),
    ).not.toBeInTheDocument();
  });

  it("does not render the catalog when the routed workout is already ended", () => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("log", {
        activeWorkout: { id: "w1", endedAt: "2026-01-01T00:00:00Z" },
      }) as unknown as ReturnType<typeof useWorkoutsOrchestrator>,
    );
    renderWorkouts();
    expect(
      screen.queryByTestId("workout-catalog-section"),
    ).not.toBeInTheDocument();
  });

  it("renders the catalog only while there is a real in-flight workout", () => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("log", {
        activeWorkout: { id: "w1", endedAt: null },
      }) as unknown as ReturnType<typeof useWorkoutsOrchestrator>,
    );
    renderWorkouts();
    expect(screen.getByTestId("workout-catalog-section")).toBeInTheDocument();
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
    renderWorkouts();
    expect(screen.getByTestId("workout-catalog-section")).toBeInTheDocument();
  });

  it("does not render journal section in catalog view", () => {
    renderWorkouts();
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
    renderWorkouts();
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
    renderWorkouts();
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
    renderWorkouts();
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
    renderWorkouts();
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
    renderWorkouts();
    fireEvent.click(screen.getByTestId("open-session"));
    expect(setView).toHaveBeenCalledWith("log");
  });

  // Каталог і шаблони мають власні маршрути, тож входи навігують, а не
  // перемикають локальний `view` (інакше «назад» у браузері викидало з
  // модуля, а посиланням на каталог не поділитись).
  it("'open-catalog' button navigates to the catalog route", () => {
    const setView = vi.fn();
    const onNavigate = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", { setView }) as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    renderWorkouts({ onNavigate });
    fireEvent.click(screen.getByTestId("open-catalog"));
    expect(onNavigate).toHaveBeenCalledWith("catalog");
    expect(setView).not.toHaveBeenCalled();
  });

  it("'open-templates' button navigates to the templates route", () => {
    const onNavigate = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    renderWorkouts({ onNavigate });
    fireEvent.click(screen.getByTestId("open-templates"));
    expect(onNavigate).toHaveBeenCalledWith("templates");
  });

  it("back from a routed section returns to the workouts hub", () => {
    const setView = vi.fn();
    const onNavigate = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("catalog", { setView }) as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    renderWorkouts({ section: "catalog", onNavigate });
    fireEvent.click(screen.getByTestId("back-btn"));
    expect(onNavigate).toHaveBeenCalledWith("workouts");
    expect(setView).not.toHaveBeenCalled();
  });

  it("passes the routine deep-link callback through the planning tile", () => {
    const onOpenRoutine = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );

    renderWorkouts({ onOpenRoutine });
    fireEvent.click(screen.getByTestId("open-schedule"));

    expect(onOpenRoutine).toHaveBeenCalledTimes(1);
  });

  it("starts an empty workout directly from Quick Start", () => {
    const handleQuickStart = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", {
        handleQuickStart,
      }) as unknown as ReturnType<typeof useWorkoutsOrchestrator>,
    );

    renderWorkouts();
    fireEvent.click(screen.getByTestId("request-start"));

    expect(handleQuickStart).toHaveBeenCalledTimes(1);
  });

  // 03-A — "Всі →" must own its own URL instead of flipping `view` to
  // "log" on the same `/fizruk/workouts` path (the dual start-path bug).
  it("'open-journal' navigates to the dedicated history route", () => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    const onNavigate = vi.fn();

    renderWorkouts({ onNavigate });
    fireEvent.click(screen.getByTestId("open-journal"));

    expect(onNavigate).toHaveBeenCalledWith("history");
  });

  // 04-A — permanent "Програми" entry in the Довідники block.
  it("'open-programs' navigates to the programs route", () => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    const onNavigate = vi.fn();

    renderWorkouts({ onNavigate });
    fireEvent.click(screen.getByTestId("open-programs"));

    expect(onNavigate).toHaveBeenCalledWith("programs");
  });
});

describe("Workouts page — sheet and confirm callback wiring", () => {
  // Regression guard (01-A follow-up): the exercise-type switcher moved
  // out of the item card and into `ExerciseDetailSheet`, which needs
  // `updateItem` to render it at all. `Workouts.tsx` is the only mounter
  // of this sheet — dropping the prop makes the switcher unreachable
  // anywhere in the app.
  it("passes updateItem through to ExerciseDetailSheet", () => {
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home") as unknown as ReturnType<
        typeof useWorkoutsOrchestrator
      >,
    );
    renderWorkouts();
    expect(screen.getByTestId("exercise-detail-sheet")).toHaveAttribute(
      "data-has-update-item",
      "true",
    );
  });

  it("wires close/delete callbacks for always-mounted sheets", () => {
    const setSelected = vi.fn();
    const setAddOpen = vi.fn();
    const setDeleteExerciseConfirm = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", {
        setSelected,
        setAddOpen,
        setDeleteExerciseConfirm,
      }) as unknown as ReturnType<typeof useWorkoutsOrchestrator>,
    );

    renderWorkouts();
    fireEvent.click(screen.getByTestId("close-detail"));
    fireEvent.click(screen.getByTestId("delete-exercise"));
    fireEvent.click(screen.getByTestId("close-add-exercise"));

    expect(setSelected).toHaveBeenCalledWith(null);
    expect(setDeleteExerciseConfirm).toHaveBeenCalledWith(true);
    expect(setAddOpen).toHaveBeenCalledWith(false);
  });

  it("wires finish flash and confirmation dialog callbacks", () => {
    const setFinishFlash = vi.fn();
    const setDeleteExerciseConfirm = vi.fn();
    const setRiskyTemplateConfirm = vi.fn();
    const handleDeleteExerciseConfirm = vi.fn();
    const handleRiskyTemplateConfirm = vi.fn();
    mockedOrchestrator.mockReturnValue(
      makeOrchestrator("home", {
        setFinishFlash,
        setDeleteExerciseConfirm,
        setRiskyTemplateConfirm,
        handleDeleteExerciseConfirm,
        handleRiskyTemplateConfirm,
      }) as unknown as ReturnType<typeof useWorkoutsOrchestrator>,
    );

    renderWorkouts();
    fireEvent.click(screen.getByTestId("clear-finish-flash"));
    fireEvent.click(screen.getByTestId("confirm-delete-exercise"));
    fireEvent.click(screen.getByTestId("cancel-delete-exercise"));
    fireEvent.click(screen.getByTestId("confirm-risky-template"));
    fireEvent.click(screen.getByTestId("cancel-risky-template"));

    expect(setFinishFlash).toHaveBeenCalledWith(null);
    expect(handleDeleteExerciseConfirm).toHaveBeenCalledTimes(1);
    expect(setDeleteExerciseConfirm).toHaveBeenCalledWith(false);
    expect(handleRiskyTemplateConfirm).toHaveBeenCalledTimes(1);
    expect(setRiskyTemplateConfirm).toHaveBeenCalledWith(null);
  });
});
