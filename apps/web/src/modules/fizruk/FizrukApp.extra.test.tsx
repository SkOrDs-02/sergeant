// @vitest-environment jsdom
/**
 * Extra coverage for FizrukApp — branches left thin in the smoke suite:
 * pwaAction start_workout, first-run markSeen, bottom-nav visibility,
 * contextual back targets, page routing props, and nav onChange.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

// ── Stable mock references ────────────────────────────────────────────────────

const navigateMock = vi.fn();

const markSeenMock = vi.fn();

// ── Heavy hook stubs ─────────────────────────────────────────────────────────

vi.mock("../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

vi.mock("./hooks/useFizrukDualWriteBoot", () => ({
  useFizrukDualWriteBoot: vi.fn(),
}));

vi.mock("./hooks/useFizrukSqliteReadBoot", () => ({
  useFizrukSqliteReadBoot: vi.fn(),
}));

vi.mock("./hooks/useFizrukWorkoutReminder", () => ({
  useFizrukWorkoutReminder: vi.fn(),
}));

vi.mock("./hooks/useFizrukProgramStart", () => ({
  useFizrukProgramStart: vi.fn(() => vi.fn()),
}));

vi.mock("./hooks/useWorkouts", () => ({
  useWorkouts: vi.fn(() => ({
    workouts: [],
    loaded: true,
    createWorkout: vi.fn(),
    addItem: vi.fn(),
  })),
  FIZRUK_WORKOUTS_STORAGE_ERROR: "fizruk-workouts-storage-error",
}));

vi.mock("./hooks/useExerciseCatalog", () => ({
  useExerciseCatalog: vi.fn(() => ({
    exercises: [],
    musclesUk: {},
  })),
}));

vi.mock("./hooks/useMonthlyPlan", () => ({
  useMonthlyPlan: vi.fn(() => ({
    days: [],
    todayTemplateId: null,
    reminderEnabled: false,
    reminderHour: 8,
    reminderMinute: 0,
  })),
}));

vi.mock("./hooks/useTrainingProgram", () => ({
  useTrainingProgram: vi.fn(() => ({
    activeProgramId: null,
    activeProgram: null,
    todaySession: null,
    activateProgram: vi.fn(),
    deactivateProgram: vi.fn(),
  })),
}));

vi.mock("../../core/onboarding/useModuleFirstRun", () => ({
  useModuleFirstRun: vi.fn(() => ({
    firstRun: false,
    markSeen: markSeenMock,
  })),
}));

vi.mock("./hooks/useFizrukRoute", () => ({
  useFizrukRoute: vi.fn(() => ({
    page: "dashboard",
    segments: [],
    navigate: navigateMock,
  })),
}));

vi.mock("./components/workouts/RestTimerOverlayConnected", () => ({
  RestTimerOverlayConnected: () => null,
}));

vi.mock("@shared/components/ui/AIPill", () => ({
  AIPill: () => null,
}));

vi.mock("@shared/components/layout", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/components/layout")
  >("@shared/components/layout");
  return {
    ...actual,
    StorageErrorBanner: () => null,
  };
});

vi.mock("@shared/components/ui/ModuleBottomNav", () => ({
  ModuleBottomNav: ({
    activeId,
    onChange,
    ariaLabel,
  }: {
    activeId: string;
    items: unknown[];
    onChange: (id: string) => void;
    module: string;
    ariaLabel: string;
  }) => (
    <nav aria-label={ariaLabel} data-testid="fizruk-nav">
      <span data-testid="active-page">{activeId}</span>
      <button
        type="button"
        data-testid="nav-workouts"
        onClick={() => onChange("workouts")}
      >
        Тренування
      </button>
      <button
        type="button"
        data-testid="nav-body"
        onClick={() => onChange("body")}
      >
        Моє тіло
      </button>
    </nav>
  ),
}));

vi.mock("./shell/FizrukRouter", () => ({
  FizrukRouter: ({
    page,
    exerciseId,
    onNavigate,
  }: {
    page: string;
    exerciseId?: string;
    onNavigate: (target: string) => void;
  }) => (
    <div
      data-testid="fizruk-router"
      data-page={page}
      data-exercise-id={exerciseId ?? ""}
    >
      <button
        type="button"
        data-testid="router-navigate-programs"
        onClick={() => onNavigate("programs")}
      >
        programs
      </button>
    </div>
  ),
}));

// ── Imports under test (must come after vi.mock declarations) ─────────────────

import FizrukApp from "./FizrukApp";
import { useFizrukRoute } from "./hooks/useFizrukRoute";
import { useTrainingProgram } from "./hooks/useTrainingProgram";
import { useModuleFirstRun } from "../../core/onboarding/useModuleFirstRun";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── pwaAction ─────────────────────────────────────────────────────────────────

describe("FizrukApp (extra) — pwaAction='start_workout'", () => {
  it("navigates to workouts when the action arrives", async () => {
    const onPwaActionConsumed = vi.fn();
    const { rerender } = render(
      <FizrukApp onPwaActionConsumed={onPwaActionConsumed} />,
    );
    rerender(
      <FizrukApp
        pwaAction="start_workout"
        onPwaActionConsumed={onPwaActionConsumed}
      />,
    );
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("workouts");
    });
    await waitFor(() => {
      expect(onPwaActionConsumed).toHaveBeenCalled();
    });
  });

  it("ignores unknown pwaAction values", async () => {
    const onPwaActionConsumed = vi.fn();
    const { rerender } = render(
      <FizrukApp onPwaActionConsumed={onPwaActionConsumed} />,
    );
    rerender(
      <FizrukApp
        pwaAction="unknown_action"
        onPwaActionConsumed={onPwaActionConsumed}
      />,
    );
    await waitFor(() => {
      expect(onPwaActionConsumed).not.toHaveBeenCalled();
    });
    expect(navigateMock).not.toHaveBeenCalledWith("workouts");
  });
});

// ── First-run markSeen ────────────────────────────────────────────────────────

describe("FizrukApp (extra) — first-run markSeen", () => {
  it("calls markSeen on mount when firstRun is true", async () => {
    vi.mocked(useModuleFirstRun).mockReturnValueOnce({
      firstRun: true,
      markSeen: markSeenMock,
    });
    render(<FizrukApp />);
    await waitFor(() => {
      expect(markSeenMock).toHaveBeenCalled();
    });
  });

  it("does not call markSeen when firstRun is false", () => {
    vi.mocked(useModuleFirstRun).mockReturnValueOnce({
      firstRun: false,
      markSeen: markSeenMock,
    });
    render(<FizrukApp />);
    expect(markSeenMock).not.toHaveBeenCalled();
  });
});

// ── Bottom nav visibility ─────────────────────────────────────────────────────

describe("FizrukApp (extra) — bottom nav visibility", () => {
  it("shows bottom nav on dashboard", () => {
    vi.mocked(useFizrukRoute).mockReturnValueOnce({
      page: "dashboard",
      segments: [],
      navigate: navigateMock,
    });
    render(<FizrukApp />);
    expect(screen.getByTestId("fizruk-nav")).toBeInTheDocument();
  });

  it.each(["atlas", "exercise"] as const)(
    "hides bottom nav on the %s page",
    (page) => {
      vi.mocked(useFizrukRoute).mockReturnValueOnce({
        page,
        segments: page === "exercise" ? ["ex-1"] : [],
        navigate: navigateMock,
      });
      render(<FizrukApp />);
      expect(screen.queryByTestId("fizruk-nav")).not.toBeInTheDocument();
    },
  );

  it.each(["workouts", "progress", "body"] as const)(
    "shows bottom nav on the %s page",
    (page) => {
      vi.mocked(useFizrukRoute).mockReturnValueOnce({
        page,
        segments: [],
        navigate: navigateMock,
      });
      render(<FizrukApp />);
      expect(screen.getByTestId("fizruk-nav")).toBeInTheDocument();
      expect(screen.getByTestId("active-page").textContent).toBe(page);
    },
  );
});

// ── Bottom nav onChange ───────────────────────────────────────────────────────

describe("FizrukApp (extra) — bottom nav onChange", () => {
  it("calls navigate when a nav item is tapped", () => {
    render(<FizrukApp />);
    fireEvent.click(screen.getByTestId("nav-workouts"));
    expect(navigateMock).toHaveBeenCalledWith("workouts");
  });
});

// ── Contextual back targets ───────────────────────────────────────────────────

describe("FizrukApp (extra) — contextual back navigation", () => {
  it.each([
    ["atlas", "Моє тіло", "body"],
    ["exercise", "Тренування", "workouts"],
    ["measurements", "Моє тіло", "body"],
  ] as const)(
    "navigates from %s back to %s via contextual back",
    (page, backLabel, expectedTarget) => {
      vi.mocked(useFizrukRoute).mockReturnValueOnce({
        page,
        segments: page === "exercise" ? ["ex-1"] : [],
        navigate: navigateMock,
      });
      render(<FizrukApp />);
      fireEvent.click(
        screen.getByRole("button", { name: `Назад до ${backLabel}` }),
      );
      expect(navigateMock).toHaveBeenCalledWith(expectedTarget);
    },
  );
});

// ── Page routing props ────────────────────────────────────────────────────────

describe("FizrukApp (extra) — page routing", () => {
  it.each([
    "dashboard",
    "workouts",
    "progress",
    "body",
    "programs",
    "measurements",
    "atlas",
  ] as const)("passes page=%s to FizrukRouter", (page) => {
    vi.mocked(useFizrukRoute).mockReturnValueOnce({
      page,
      segments: [],
      navigate: navigateMock,
    });
    render(<FizrukApp />);
    expect(screen.getByTestId("fizruk-router")).toHaveAttribute(
      "data-page",
      page,
    );
  });

  it("passes exerciseId from route segments on the exercise page", () => {
    vi.mocked(useFizrukRoute).mockReturnValueOnce({
      page: "exercise",
      segments: ["bench-press-123"],
      navigate: navigateMock,
    });
    render(<FizrukApp />);
    expect(screen.getByTestId("fizruk-router")).toHaveAttribute(
      "data-exercise-id",
      "bench-press-123",
    );
  });

  it("omits exerciseId when the exercise page has no segment", () => {
    vi.mocked(useFizrukRoute).mockReturnValueOnce({
      page: "exercise",
      segments: [],
      navigate: navigateMock,
    });
    render(<FizrukApp />);
    expect(screen.getByTestId("fizruk-router")).toHaveAttribute(
      "data-exercise-id",
      "",
    );
  });

  it("forwards onNavigate from FizrukRouter to useFizrukRoute.navigate", () => {
    render(<FizrukApp />);
    fireEvent.click(screen.getByTestId("router-navigate-programs"));
    expect(navigateMock).toHaveBeenCalledWith("programs");
  });
});

// ── Header callbacks ──────────────────────────────────────────────────────────

describe("FizrukApp (extra) — header callbacks", () => {
  it("calls onBackToHub from the hub back button on dashboard", () => {
    const onBackToHub = vi.fn();
    render(<FizrukApp onBackToHub={onBackToHub} />);
    fireEvent.click(screen.getByLabelText("До хабу"));
    expect(onBackToHub).toHaveBeenCalled();
  });

  it("renders settings button when onOpenSettings is provided", () => {
    const onOpenSettings = vi.fn();
    render(<FizrukApp onOpenSettings={onOpenSettings} />);
    fireEvent.click(screen.getByLabelText("Налаштування модуля"));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("shows contextual page title on atlas", () => {
    vi.mocked(useFizrukRoute).mockReturnValueOnce({
      page: "atlas",
      segments: [],
      navigate: navigateMock,
    });
    render(<FizrukApp />);
    expect(screen.getByText("Атлас тіла")).toBeInTheDocument();
  });

  it("shows active program subtitle on programs page", () => {
    vi.mocked(useFizrukRoute).mockReturnValueOnce({
      page: "programs",
      segments: [],
      navigate: navigateMock,
    });
    vi.mocked(useTrainingProgram).mockReturnValueOnce({
      programs: [],
      activeProgramId: "prog-1",
      activeProgram: { name: "Сила 5×5" } as ReturnType<
        typeof useTrainingProgram
      >["activeProgram"],
      todaySession: null,
      activateProgram: vi.fn(),
      deactivateProgram: vi.fn(),
    });
    render(<FizrukApp />);
    expect(screen.getByText("Активна: Сила 5×5")).toBeInTheDocument();
  });
});
