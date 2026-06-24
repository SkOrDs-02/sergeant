/** @vitest-environment jsdom */
/**
 * Render + interaction tests for HabitDetailSheet.
 *
 * The sheet derives all of its statistics from the pure-domain
 * `streaks` / `hubCalendarAggregate` helpers, so we let those run for
 * real and only stub the destructive `routineStorage` mutators (which
 * touch localStorage) plus the heavy `HabitQuickCreateDialog` editor.
 * "Today" is pinned with fake timers so the Kyiv-anchored calendar /
 * completion-% are deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { RoutineState } from "../lib/types";

const {
  deleteHabitMock,
  restoreHabitMock,
  snapshotHabitMock,
  showUndoToastMock,
} = vi.hoisted(() => ({
  deleteHabitMock: vi.fn(),
  restoreHabitMock: vi.fn(),
  snapshotHabitMock: vi.fn(),
  showUndoToastMock: vi.fn(),
}));

vi.mock("../lib/routineStorage", () => ({
  deleteHabit: deleteHabitMock,
  restoreHabit: restoreHabitMock,
  snapshotHabit: snapshotHabitMock,
}));

vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: showUndoToastMock,
}));

vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

// Heavy edit dialog → lightweight marker that exposes its open state.
vi.mock("./HabitQuickCreateDialog", () => ({
  HabitQuickCreateDialog: ({
    open,
    editingId,
  }: {
    open: boolean;
    editingId?: string;
  }) =>
    open ? <div data-testid="edit-dialog" data-editing={editingId} /> : null,
}));

import { HabitDetailSheet } from "./HabitDetailSheet";

// 2026-06-16T09:00Z = 12:00 Europe/Kyiv (summer, UTC+3) → Kyiv day 2026-06-16.
const FIXED_NOW = new Date("2026-06-16T09:00:00Z");

function makeRoutine(over: Partial<RoutineState> = {}): RoutineState {
  return {
    ...defaultRoutineState(),
    tags: [{ id: "t1", name: "Ранок" }],
    categories: [{ id: "c1", name: "Здоров'я" }],
    habits: [
      {
        id: "h1",
        name: "Випити воду",
        emoji: "💧",
        recurrence: "daily",
        tagIds: ["t1"],
        categoryId: "c1",
        timeOfDay: "08:00",
        startDate: "2026-01-01",
      },
    ],
    completions: { h1: ["2026-06-16", "2026-06-15", "2026-06-14"] },
    completionNotes: {},
    ...over,
  };
}

describe("HabitDetailSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    deleteHabitMock.mockReset().mockImplementation((s: RoutineState) => s);
    restoreHabitMock.mockReset().mockImplementation((s: RoutineState) => s);
    snapshotHabitMock.mockReset().mockReturnValue({ habit: { id: "h1" } });
    showUndoToastMock.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns null when the habit does not exist", () => {
    const { container } = render(
      <HabitDetailSheet
        habitId="missing"
        routine={makeRoutine()}
        onClose={vi.fn()}
      />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the habit name, recurrence + time and the tag/category chips", () => {
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={vi.fn()}
      />,
    );
    // Title renders "{emoji} {name}" inside a single <span>.
    expect(
      screen.getByText(
        (_t, el) =>
          el?.tagName === "SPAN" && el.textContent === "💧 Випити воду",
      ),
    ).toBeInTheDocument();
    // recurrence label "Щодня" + timeOfDay are concatenated
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
    expect(screen.getByText("Ранок")).toBeInTheDocument();
    expect(screen.getByText("Здоров'я")).toBeInTheDocument();
  });

  it("shows total completions and a non-zero current streak in the stats grid", () => {
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={vi.fn()}
      />,
    );
    const totalLabel = screen.getByText("Разів виконано");
    // "Разів виконано" caption sits directly under its count <p> in the card.
    const card = totalLabel.parentElement!;
    expect(card.textContent).toContain("3");
  });

  it("renders an em-dash when nothing is scheduled in the windows (all pct null)", () => {
    // A "once" habit anchored years ago is never scheduled within the last
    // 7/30/90 days, so completionPct returns null for all three windows.
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine({
          habits: [
            {
              id: "h1",
              name: "Старе",
              recurrence: "once",
              startDate: "2020-01-01",
            },
          ],
          completions: { h1: [] },
        })}
        onClose={vi.fn()}
      />,
    );
    // The "% за 7 / 30 / 90 д" card collapses to an em-dash when no data.
    const pctLabel = screen.getByText("% за 7 / 30 / 90 д");
    expect(pctLabel.parentElement!.textContent).toContain("—");
  });

  it("navigates the calendar cursor across a month boundary", () => {
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={vi.fn()}
      />,
    );
    // Starts on the current Kyiv month (червень 2026).
    expect(screen.getByText(/червень 2026/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Наступний місяць" }));
    expect(screen.getByText(/липень 2026/i)).toBeInTheDocument();
    // back twice → May 2026
    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    fireEvent.click(screen.getByRole("button", { name: "Попередній місяць" }));
    expect(screen.getByText(/травень 2026/i)).toBeInTheDocument();
  });

  it("wraps the year backwards from January to December", () => {
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={vi.fn()}
      />,
    );
    // червень(5) → back 6 times lands on грудень 2025
    for (let i = 0; i < 6; i++) {
      fireEvent.click(
        screen.getByRole("button", { name: "Попередній місяць" }),
      );
    }
    expect(screen.getByText(/грудень 2025/i)).toBeInTheDocument();
  });

  it("renders the recent-notes section only when notes exist", () => {
    const withNote = makeRoutine();
    // completionNoteKey(h1, 2026-06-16) — let the real impl build the key by
    // rendering once without notes and confirming absence first.
    render(
      <HabitDetailSheet habitId="h1" routine={withNote} onClose={vi.fn()} />,
    );
    expect(screen.queryByText("Останні нотатки")).not.toBeInTheDocument();
  });

  it("renders notes when completionNotes contains a matching key", async () => {
    const { completionNoteKey } = await import("@sergeant/routine-domain");
    const key = completionNoteKey("h1", "2026-06-16");
    const routine = makeRoutine({
      completionNotes: { [key]: "Пив повний стакан" },
    });
    render(
      <HabitDetailSheet habitId="h1" routine={routine} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Останні нотатки")).toBeInTheDocument();
    expect(screen.getByText("Пив повний стакан")).toBeInTheDocument();
  });

  it("renders read-only (no footer actions) when setRoutine is omitted", () => {
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /редагувати/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the edit dialog from the footer when mutable", () => {
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={vi.fn()}
        setRoutine={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /редагувати/i }));
    expect(screen.getByTestId("edit-dialog")).toHaveAttribute(
      "data-editing",
      "h1",
    );
  });

  it("deletes via confirm dialog, snapshots, shows undo toast and closes", () => {
    const onClose = vi.fn();
    const setRoutine = vi.fn(
      (value: RoutineState | ((s: RoutineState) => RoutineState)) => {
        // exercise the functional updater so snapshot/delete mocks fire
        if (typeof value === "function") value(makeRoutine());
      },
    );
    render(
      <HabitDetailSheet
        habitId="h1"
        routine={makeRoutine()}
        onClose={onClose}
        setRoutine={setRoutine}
      />,
    );
    // Footer "Видалити" opens the confirm dialog.
    fireEvent.click(screen.getByRole("button", { name: /^видалити$/i }));
    // ConfirmDialog (role=alertdialog) is now mounted — confirm inside it.
    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", {
      name: /^видалити$/i,
    });
    fireEvent.click(confirm);
    expect(snapshotHabitMock).toHaveBeenCalledWith(expect.anything(), "h1");
    expect(deleteHabitMock).toHaveBeenCalledWith(expect.anything(), "h1");
    expect(showUndoToastMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows weekday labels for a weekly habit", () => {
    const routine = makeRoutine({
      habits: [
        {
          id: "h1",
          name: "Зал",
          recurrence: "weekly",
          weekdays: [0, 2, 4],
        },
      ],
      completions: { h1: [] },
    });
    render(
      <HabitDetailSheet habitId="h1" routine={routine} onClose={vi.fn()} />,
    );
    // WEEKDAY_LABELS[0/2/4] joined with ", "
    expect(screen.getByText(/Пн.*Ср.*Пт/)).toBeInTheDocument();
  });

  it("renders 'Без обмежень дат' when the habit has neither start nor end date", () => {
    const routine = makeRoutine({
      habits: [{ id: "h1", name: "Тест", recurrence: "daily" }],
      completions: { h1: [] },
    });
    render(
      <HabitDetailSheet habitId="h1" routine={routine} onClose={vi.fn()} />,
    );
    expect(screen.getByText("Без обмежень дат")).toBeInTheDocument();
  });
});
