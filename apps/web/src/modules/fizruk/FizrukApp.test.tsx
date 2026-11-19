// @vitest-environment jsdom
/**
 * Smoke tests for FizrukApp (the module shell + router).
 * Mocks the heavy boot hooks and sub-components — verifies that the
 * module shell mounts, bottom nav renders, and default page loads.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  act,
  fireEvent,
} from "@testing-library/react";

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
import { useFizrukProgramStart } from "./hooks/useFizrukProgramStart";

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
    // ModuleBottomNav renders nav items for fizruk — check for at least one.
    // Since the V-7 chrome audit fix the nav is shown on every Fizruk page
    // (see FizrukApp.extra.test.tsx for the per-page coverage, including
    // Атлас/Вправа/Заміри).
    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
  });

  it("renders the FizrukHeader title text for the dashboard page", () => {
    render(<FizrukApp />);
    // FizrukHeader renders "Фізрук" as the module heading on the dashboard page
    // Назва модуля — хром оболонки, свідомо не заголовок (#527).
    expect(screen.getByTestId("module-header-title")).toHaveTextContent(
      "Фізрук",
    );
  });

  it("renders with optional props left undefined without crashing", () => {
    expect(() =>
      render(
        <FizrukApp
          onGoToHub={vi.fn()}
          pwaAction={null}
          onPwaActionConsumed={vi.fn()}
        />,
      ),
    ).not.toThrow();
  });

  it("жорстке застереження на старті програми питає підтвердження (ADR-0083)", () => {
    // Сам гейт тестується в `useFizrukProgramStart.test.tsx`; тут — що
    // оболонка справді показує діалог і продовжує старт лише після «так».
    render(<FizrukApp />);
    const args = vi.mocked(useFizrukProgramStart).mock.calls.at(-1)?.[0];
    expect(args?.injurySites).toBeInstanceOf(Set);
    const proceed = vi.fn();
    act(() => args?.onRecoveryConflict(proceed));
    expect(screen.getByText("Є жорстке застереження")).toBeInTheDocument();
    expect(proceed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Так, почати" }));
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});
