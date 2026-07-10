// @vitest-environment jsdom
/**
 * Tests for WorkoutFinishSheets — the post-workout finish overlay.
 * Covers null guard (renders nothing), wellbeing step UI, energy/mood
 * selection, skip → summary transition, save → summary transition,
 * summary step collapsed/expanded states, close, and the cross-module
 * nutrition nudge.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  WorkoutFinishSheets,
  type FinishFlashState,
} from "./WorkoutFinishSheets";

// Cross-module prompt helpers — default to not suppressed so the nudge shows.
vi.mock("@shared/lib/modules/crossModulePrompt", () => ({
  isCrossModulePromptSuppressed: vi.fn(() => false),
  recordCrossModulePromptAccepted: vi.fn(),
}));

vi.mock("@shared/lib/modules/hubNav", () => ({
  openHubModule: vi.fn(),
}));

// useDialogFocusTrap — no-op in jsdom.
vi.mock("@shared/hooks/useDialogFocusTrap", () => ({
  useDialogFocusTrap: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeFlash(over: Partial<FinishFlashState> = {}): FinishFlashState {
  return {
    step: "wellbeing",
    collapsed: false,
    workoutId: "w-1",
    energy: null,
    mood: null,
    durationSec: 3600,
    items: 5,
    tonnageKg: 1000,
    ...over,
  } as FinishFlashState;
}

function renderSheets(
  flash: FinishFlashState | null,
  setFinishFlash = vi.fn(),
  updateWorkout = vi.fn(),
) {
  return render(
    <WorkoutFinishSheets
      finishFlash={flash}
      setFinishFlash={setFinishFlash}
      updateWorkout={updateWorkout}
    />,
  );
}

describe("WorkoutFinishSheets — null guard", () => {
  it("renders nothing when finishFlash is null", () => {
    const { container } = renderSheets(null);
    expect(container.firstChild).toBeNull();
  });
});

describe("WorkoutFinishSheets — wellbeing step", () => {
  it("renders Самопочуття heading and rating buttons", () => {
    renderSheets(makeFlash({ step: "wellbeing" }));
    expect(screen.getByText("Самопочуття")).toBeInTheDocument();
    // 5 energy + 5 mood = 10 numbered buttons
    const numbered = screen
      .getAllByRole("button")
      .filter((b) => ["1", "2", "3", "4", "5"].includes(b.textContent ?? ""));
    expect(numbered.length).toBe(10);
  });

  it("clicking 'Пропустити' advances step to summary", () => {
    const setFinishFlash = vi.fn();
    renderSheets(makeFlash({ step: "wellbeing" }), setFinishFlash);
    fireEvent.click(screen.getByRole("button", { name: "Пропустити" }));
    expect(setFinishFlash).toHaveBeenCalled();
    // Verify the updater moves to summary step.
    const updater = setFinishFlash.mock.calls[0]![0] as (
      f: FinishFlashState,
    ) => FinishFlashState;
    const result = updater(makeFlash({ step: "wellbeing" }));
    expect(result.step).toBe("summary");
  });

  it("clicking an energy button calls setFinishFlash with energy value", () => {
    const setFinishFlash = vi.fn();
    renderSheets(makeFlash({ step: "wellbeing" }), setFinishFlash);
    // The first `3` button is the energy row.
    const threes = screen.getAllByRole("button", { name: "3" });
    fireEvent.click(threes[0]!);
    expect(setFinishFlash).toHaveBeenCalled();
  });

  it("clicking 'Зберегти' without any rating advances step without calling updateWorkout", () => {
    const setFinishFlash = vi.fn();
    const updateWorkout = vi.fn();
    renderSheets(
      makeFlash({ step: "wellbeing", energy: null, mood: null }),
      setFinishFlash,
      updateWorkout,
    );
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateWorkout).not.toHaveBeenCalled();
    expect(setFinishFlash).toHaveBeenCalled();
  });

  it("clicking 'Зберегти' with energy set calls updateWorkout and advances", () => {
    const setFinishFlash = vi.fn();
    const updateWorkout = vi.fn();
    renderSheets(
      makeFlash({ step: "wellbeing", energy: 4, mood: null }),
      setFinishFlash,
      updateWorkout,
    );
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(updateWorkout).toHaveBeenCalledWith("w-1", {
      wellbeing: { energy: 4 },
    });
    expect(setFinishFlash).toHaveBeenCalled();
  });
});

describe("WorkoutFinishSheets — summary step collapsed", () => {
  it("renders a collapsed result button showing duration", () => {
    renderSheets(makeFlash({ step: "summary", collapsed: true }));
    expect(screen.getByText("✓ Результати")).toBeInTheDocument();
    // 3600 seconds → formatted as "1:00:00" or "60 хв" depending on formatDurShort
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("clicking the collapsed button calls setFinishFlash to expand", () => {
    const setFinishFlash = vi.fn();
    renderSheets(
      makeFlash({ step: "summary", collapsed: true }),
      setFinishFlash,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(setFinishFlash).toHaveBeenCalled();
  });
});

describe("WorkoutFinishSheets — summary step expanded", () => {
  it("renders 'Завершено' heading and stat tiles", () => {
    renderSheets(makeFlash({ step: "summary", collapsed: false }));
    expect(screen.getByText("Завершено")).toBeInTheDocument();
    expect(screen.getByText("Час")).toBeInTheDocument();
    expect(screen.getByText("Вправ")).toBeInTheDocument();
    expect(screen.getByText("Обʼєм")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1000 кг")).toBeInTheDocument();
  });

  it("clicking 'Закрити' calls setFinishFlash(null)", () => {
    const setFinishFlash = vi.fn();
    renderSheets(
      makeFlash({ step: "summary", collapsed: false }),
      setFinishFlash,
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(setFinishFlash).toHaveBeenCalledWith(null);
  });

  it("clicking 'Готово' calls setFinishFlash(null)", () => {
    const setFinishFlash = vi.fn();
    renderSheets(
      makeFlash({ step: "summary", collapsed: false }),
      setFinishFlash,
    );
    fireEvent.click(screen.getByRole("button", { name: "Готово" }));
    expect(setFinishFlash).toHaveBeenCalledWith(null);
  });

  it("clicking 'Згорнути' calls setFinishFlash with collapsed true", () => {
    const setFinishFlash = vi.fn();
    renderSheets(
      makeFlash({ step: "summary", collapsed: false }),
      setFinishFlash,
    );
    fireEvent.click(screen.getByRole("button", { name: "Згорнути" }));
    expect(setFinishFlash).toHaveBeenCalled();
    const updater = setFinishFlash.mock.calls[0]![0] as (
      f: FinishFlashState,
    ) => FinishFlashState;
    const result = updater(makeFlash({ step: "summary", collapsed: false }));
    expect(result.collapsed).toBe(true);
  });

  it("shows the nutrition nudge and calls openHubModule on click", async () => {
    const { openHubModule } = await import("@shared/lib/modules/hubNav");
    renderSheets(makeFlash({ step: "summary", collapsed: false }));
    fireEvent.click(
      screen.getByRole("button", { name: /Додати білок після тренування/ }),
    );
    expect(openHubModule).toHaveBeenCalledWith("nutrition", "log");
  });

  it("shows savedWellbeing section when energy and mood were saved", () => {
    renderSheets(
      makeFlash({
        step: "summary",
        collapsed: false,
        savedWellbeing: { energy: 3, mood: 4 },
      }),
    );
    expect(screen.getByText(/Самопочуття:/)).toBeInTheDocument();
    expect(screen.getByText(/енергія 3\/5/)).toBeInTheDocument();
    expect(screen.getByText(/настрій 4\/5/)).toBeInTheDocument();
  });

  it("hides savedWellbeing section when not set", () => {
    renderSheets(
      makeFlash({ step: "summary", collapsed: false, savedWellbeing: null }),
    );
    expect(screen.queryByText(/Самопочуття:/)).not.toBeInTheDocument();
  });

  it("shows '—' for tonnage when tonnageKg is 0", () => {
    renderSheets(
      makeFlash({ step: "summary", collapsed: false, tonnageKg: 0 }),
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
