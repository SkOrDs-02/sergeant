// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  act,
  waitFor,
} from "@testing-library/react";

// Mock the heavy ActiveWorkoutPanel down to a tiny probe that surfaces the
// onFinishClick callback as a single button. This keeps the test focused on
// WorkoutJournalSection's finish flow, not ActiveWorkoutPanel internals.
vi.mock("../session/SessionView", () => ({
  SessionView: ({ onFinishClick }: { onFinishClick: () => void }) => (
    <button type="button" data-testid="finish-btn" onClick={onFinishClick}>
      Завершити
    </button>
  ),
}));

vi.mock("../workouts/WorkoutSummaryView", () => ({
  WorkoutSummaryView: ({ onDelete }: { onDelete: () => void }) => (
    <div data-testid="summary-view">
      <button type="button" onClick={onDelete}>
        summary-delete
      </button>
    </div>
  ),
}));

const momentMocks = vi.hoisted(() => ({
  record: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("../../lib/workoutMoments", () => ({
  recordWorkoutMoment: momentMocks.record,
  clearWorkoutMoment: momentMocks.clear,
}));

const detachedMocks = vi.hoisted(() => ({ reopen: vi.fn() }));
vi.mock("../../lib/reopenWorkoutDetached", () => ({
  reopenWorkoutDetached: detachedMocks.reopen,
}));

import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import { WorkoutJournalSection } from "./WorkoutJournalSection";
import {
  peekPendingRetroEnd,
  setPendingRetroEnd,
} from "../../lib/pendingRetroEnd";

/** «Завершити» → підтвердження → «Завершити» в аркуші (Фз-2). */
function confirmFinish() {
  fireEvent.click(screen.getByTestId("finish-btn"));
  const dialog = screen.getByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Завершити" }));
}

// WorkoutJournalSection now calls `useToast()` to surface the
// "Тренування збережено" confirmation on finish. Tests must render inside a
// ToastProvider so the context is available.
function renderWithToast(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      {ui}
      <ToastContainer />
    </ToastProvider>,
  );
}

function baseProps(
  overrides: { activeWorkout?: Workout } & Record<string, unknown> = {},
) {
  const active: Workout = overrides.activeWorkout ?? {
    id: "w-active",
    // Година тому: старіша за 12 год сесія тепер дає попередження (data-37).
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    endedAt: null,
    items: [],
    groups: [],
    warmup: null,
    cooldown: null,
    note: "",
  };
  return {
    activeWorkout: active,
    activeDuration: "00:42",
    onOpenItem: vi.fn(),
    onAddExercise: vi.fn(),
    recBy: {},
    injurySites: new Set<never>(),
    lastByExerciseId: {},
    setRestTimer: vi.fn(),
    updateWorkout: vi.fn(),
    updateItem: vi.fn(),
    removeItem: vi.fn(),
    setFinishFlash: vi.fn(),
    endWorkout: vi.fn(() => ({
      ...active,
      endedAt: new Date().toISOString(),
    })),
    summarizeWorkoutForFinish: vi.fn(() => ({
      durationSec: 42,
      items: 0,
      tonnageKg: 0,
    })),
    deleteWorkout: vi.fn(),
    onRepeatWorkout: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("WorkoutJournalSection – Завершити finish flow", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("Фз-2: тап «Завершити» лише питає «Завершити зараз?» з підсумком і нічого не зберігає", () => {
    const props = baseProps({
      summarizeWorkoutForFinish: vi.fn(() => ({
        durationSec: 30 * 60,
        items: 1,
        tonnageKg: 870,
      })),
    });
    renderWithToast(<WorkoutJournalSection {...props} />);

    fireEvent.click(screen.getByTestId("finish-btn"));

    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Завершити зараз?")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("30 хв · 1 вправа");
    expect(dialog).toHaveTextContent("870 кг×повт");
    expect(dialog).toHaveTextContent("10 секунд");
    expect(props.endWorkout).not.toHaveBeenCalled();
    expect(props.setFinishFlash).not.toHaveBeenCalled();
  });

  it("Фз-2: «Ще тренуюсь» закриває підтвердження, сесія триває", () => {
    const props = baseProps();
    renderWithToast(<WorkoutJournalSection {...props} />);

    fireEvent.click(screen.getByTestId("finish-btn"));
    fireEvent.click(screen.getByRole("button", { name: "Ще тренуюсь" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(props.endWorkout).not.toHaveBeenCalled();
    expect(props.setRestTimer).not.toHaveBeenCalled();
    expect(screen.getByTestId("finish-btn")).toBeInTheDocument();
  });

  it("Фз-2: «Повернутись у сесію» відкочує завершення без хвостів", () => {
    const before: Workout = {
      id: "w-undo",
      startedAt: new Date(Date.now() - 3600_000).toISOString(),
      endedAt: null,
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
      wellbeing: { sleep: 7, soreness: null },
    } as Workout;
    const retroEnd = new Date(Date.now() - 600_000).toISOString();
    setPendingRetroEnd("w-undo", retroEnd);
    const props = baseProps({ activeWorkout: before });
    renderWithToast(<WorkoutJournalSection {...props} />);

    confirmFinish();
    expect(props.endWorkout).toHaveBeenCalledWith("w-undo");
    expect(momentMocks.record).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: /Повернутись у сесію/ }),
    );

    // Змонтована сторінка відкочує через хук: endedAt і самопочуття ДО.
    expect(props.updateWorkout).toHaveBeenCalledWith("w-undo", {
      endedAt: null,
      wellbeing: { sleep: 7, soreness: null },
    });
    expect(detachedMocks.reopen).not.toHaveBeenCalled();
    // Аркуш самопочуття закрито, момент прибрано, ретро-кінець повернуто.
    expect(props.setFinishFlash).toHaveBeenLastCalledWith(null);
    expect(momentMocks.clear).toHaveBeenCalledWith("w-undo");
    expect(peekPendingRetroEnd("w-undo")).toBe(retroEnd);
  });

  it("Фз-2: без тапу за 10 с тренування лишається завершеним, кнопка зникає", () => {
    vi.useFakeTimers();
    try {
      const props = baseProps();
      renderWithToast(<WorkoutJournalSection {...props} />);
      confirmFinish();
      expect(
        screen.getByRole("button", { name: /Повернутись у сесію/ }),
      ).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
      expect(
        screen.queryByRole("button", { name: /Повернутись у сесію/ }),
      ).toBeNull();
      expect(props.updateWorkout).not.toHaveBeenCalled();
      expect(props.endWorkout).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Фз-2: видалення з підсумку гасить «Повернутись у сесію», щоб не воскресити видалене", async () => {
    const props = baseProps();
    const view = renderWithToast(<WorkoutJournalSection {...props} />);
    confirmFinish();
    const ended = {
      ...props.activeWorkout,
      endedAt: new Date().toISOString(),
    };
    view.rerender(
      <ToastProvider>
        <WorkoutJournalSection {...props} activeWorkout={ended} />
        <ToastContainer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("summary-delete"));
    expect(props.deleteWorkout).toHaveBeenCalledWith("w-active");
    // Тост іде з анімацією виходу, тож чекаємо, а не дивимось миттєво.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Повернутись у сесію/ }),
      ).toBeNull(),
    );
  });

  it("Фз-2: після розмонтування сторінки повернення йде детачено", () => {
    const props = baseProps();
    const view = renderWithToast(<WorkoutJournalSection {...props} />);
    confirmFinish();
    // Сторінка пішла (наприклад, «Готово» → список), тост лишився.
    view.rerender(
      <ToastProvider>
        <div />
        <ToastContainer />
      </ToastProvider>,
    );
    // Провайдер той самий, тож тост досі на екрані.
    fireEvent.click(
      screen.getByRole("button", { name: /Повернутись у сесію/ }),
    );
    expect(props.updateWorkout).not.toHaveBeenCalled();
    expect(detachedMocks.reopen).toHaveBeenCalledWith(
      props.activeWorkout,
      expect.any(String),
    );
  });

  it("clears the rest timer and opens the wellbeing sheet on Завершити", () => {
    const props = baseProps();
    renderWithToast(<WorkoutJournalSection {...props} />);

    confirmFinish();

    expect(props.endWorkout).toHaveBeenCalledWith("w-active");
    expect(props.setRestTimer).toHaveBeenCalledWith(null);
    expect(props.setFinishFlash).toHaveBeenCalledTimes(1);
    const flash = props.setFinishFlash.mock.calls[0]![0];
    expect(flash).toMatchObject({
      step: "wellbeing",
      workoutId: "w-active",
      energy: null,
      mood: null,
      injurySites: [],
    });
  });

  it("data-37: забута сесія (>12 год) не завершується мовчки — показує попередження", () => {
    const props = baseProps({
      activeWorkout: {
        id: "w-forgot",
        startedAt: new Date(Date.now() - 60 * 3600_000).toISOString(),
        endedAt: null,
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      },
    });
    renderWithToast(<WorkoutJournalSection {...props} />);

    fireEvent.click(screen.getByTestId("finish-btn"));

    expect(props.endWorkout).not.toHaveBeenCalled();
    expect(screen.getByText("Тренування вийшло задовгим")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Лишити як є"));
    expect(props.endWorkout).toHaveBeenCalledWith("w-forgot");
  });

  it("data-37: виправлений кінець записується замість «зараз»", () => {
    const props = baseProps({
      activeWorkout: {
        id: "w-forgot2",
        startedAt: new Date(Date.now() - 60 * 3600_000).toISOString(),
        endedAt: null,
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      },
    });
    renderWithToast(<WorkoutJournalSection {...props} />);
    fireEvent.click(screen.getByTestId("finish-btn"));

    const input = screen.getByLabelText("Завершення") as HTMLInputElement;
    const fixed = new Date(Date.now() - 58 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    fireEvent.change(input, {
      target: {
        value: `${fixed.getFullYear()}-${pad(fixed.getMonth() + 1)}-${pad(fixed.getDate())}T${pad(fixed.getHours())}:${pad(fixed.getMinutes())}`,
      },
    });
    fireEvent.click(screen.getByText("Завершити з цим часом"));

    expect(props.endWorkout).toHaveBeenCalledWith("w-forgot2");
    expect(peekPendingRetroEnd("w-forgot2")).not.toBeNull();
  });

  it("is idempotent on rapid double-click — finish sheet opens only once", () => {
    const props = baseProps();
    renderWithToast(<WorkoutJournalSection {...props} />);

    fireEvent.click(screen.getByTestId("finish-btn"));
    const confirm = within(screen.getByRole("alertdialog")).getByRole(
      "button",
      { name: "Завершити" },
    );
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    // endWorkout is idempotent on the data side, but the side effects that
    // drive the UI (opening the finish sheet, clearing the rest timer) must
    // not run a second time.
    expect(props.setFinishFlash).toHaveBeenCalledTimes(1);
    expect(props.setRestTimer).toHaveBeenCalledTimes(1);
  });

  // 02-A: an already-ended workout no longer renders `ActiveWorkoutPanel`
  // (hence no "Завершити" button reachable at all) — it renders the
  // read-only `WorkoutSummaryView` instead. The in-component re-entry
  // guard (`if (!activeWorkout || activeWorkout.endedAt) return;`) is
  // kept as cheap defensive code but is structurally unreachable via the
  // UI now; this test asserts the branch switch instead of a no-op click.
  it("renders the read-only summary — not the editable panel — for an already-finished workout", () => {
    const ended = {
      id: "w-ended",
      startedAt: new Date("2025-01-01T10:00:00Z").toISOString(),
      endedAt: new Date("2025-01-01T11:00:00Z").toISOString(),
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };
    const props = baseProps({ activeWorkout: ended });
    renderWithToast(<WorkoutJournalSection {...props} />);

    expect(screen.getByTestId("summary-view")).toBeTruthy();
    expect(screen.queryByTestId("finish-btn")).toBeNull();
    expect(props.endWorkout).not.toHaveBeenCalled();
    expect(props.setFinishFlash).not.toHaveBeenCalled();
  });
});
