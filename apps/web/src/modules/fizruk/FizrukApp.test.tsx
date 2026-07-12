// @vitest-environment jsdom
/**
 * Smoke tests for FizrukApp (the module shell + router).
 * Mocks the heavy boot hooks and sub-components — verifies that the
 * module shell mounts, bottom nav renders, and default page loads.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Stub kvStoreBoot (requires @sergeant/db-schema/sqlite WASM artefact)
vi.mock("../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => null,
  bootstrapKvStore: () => Promise.resolve(),
}));

// Boot hooks — fire-and-forget side effects; no return value needed
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
    markSeen: vi.fn(),
  })),
}));

vi.mock("@shared/hooks/usePwaAction", () => ({
  usePwaAction: vi.fn(),
}));

// Stub the route hook so we control which page is "active"
vi.mock("./hooks/useFizrukRoute", () => ({
  useFizrukRoute: vi.fn(() => ({
    page: "dashboard",
    segments: [],
    navigate: vi.fn(),
  })),
}));

// Stub FizrukRouter — the router itself is covered by its own tests
vi.mock("./shell/FizrukRouter", () => ({
  FizrukRouter: () => <div data-testid="fizruk-router" />,
}));

// Stub RestTimerOverlayConnected to avoid timer/AudioContext complexity
vi.mock("./components/workouts/RestTimerOverlayConnected", () => ({
  RestTimerOverlayConnected: () => null,
}));

// Stub StorageErrorBanner
vi.mock("@shared/components/layout", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/components/layout")
  >("@shared/components/layout");
  return {
    ...actual,
    StorageErrorBanner: () => null,
  };
});

import FizrukApp from "./FizrukApp";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FizrukApp smoke tests", () => {
  it("mounts without crashing", () => {
    expect(() => render(<FizrukApp />)).not.toThrow();
  });

  it("renders the FizrukRouter (page outlet)", () => {
    render(<FizrukApp />);
    expect(screen.getByTestId("fizruk-router")).toBeInTheDocument();
  });

  it("renders the bottom navigation bar on the dashboard page", () => {
    render(<FizrukApp />);
    // ModuleBottomNav renders nav items for fizruk — check for at least one
    // The nav is shown when page !== 'atlas' && page !== 'exercise'
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
  });

  it("renders the FizrukHeader title text for the dashboard page", () => {
    render(<FizrukApp />);
    // FizrukHeader renders "ФІЗРУК" as the module title on the dashboard page
    expect(screen.getByText("ФІЗРУК")).toBeInTheDocument();
  });

  it("renders with optional props left undefined without crashing", () => {
    expect(() =>
      render(
        <FizrukApp
          onBackToHub={vi.fn()}
          onOpenSettings={vi.fn()}
          pwaAction={null}
          onPwaActionConsumed={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });
});
