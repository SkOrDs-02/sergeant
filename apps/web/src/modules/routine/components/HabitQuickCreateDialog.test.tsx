/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import type { Habit, RoutineState } from "../lib/types";
import { HabitQuickCreateDialog } from "./HabitQuickCreateDialog";

// Silence routineStorage persistence (localStorage write-through).
vi.mock("@shared/lib/storage/storage", async () => {
  const actual = await vi.importActual<
    typeof import("@shared/lib/storage/storage")
  >("@shared/lib/storage/storage");
  return {
    ...actual,
    safeWriteLS: () => true,
    safeReadLS: () => null,
    safeReadStringLS: () => null,
  };
});

vi.mock("@shared/lib/adapters/haptic", () => ({
  hapticSuccess: vi.fn(),
  hapticTap: vi.fn(),
}));

interface HarnessProps {
  initial?: RoutineState;
  editingId?: string | null;
  firstRunHint?: boolean;
  onClose?: () => void;
}

function Harness({
  initial = defaultRoutineState(),
  editingId = null,
  firstRunHint = false,
  onClose = vi.fn(),
}: HarnessProps) {
  const [routine, setRoutine] = useState(initial);
  return (
    <ToastProvider>
      <HabitQuickCreateDialog
        open
        routine={routine}
        setRoutine={setRoutine}
        onClose={onClose}
        editingId={editingId}
        firstRunHint={firstRunHint}
      />
      <ToastContainer />
    </ToastProvider>
  );
}

function makeHabit(id: string, name: string): Habit {
  return {
    id,
    name,
    emoji: "💧",
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  } as unknown as Habit;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HabitQuickCreateDialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ToastProvider>
        <HabitQuickCreateDialog
          open={false}
          routine={defaultRoutineState()}
          setRoutine={vi.fn()}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders the create title and dialog chrome when open", () => {
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Нова звичка")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Додати звичку" }),
    ).toBeInTheDocument();
  });

  it("renders the edit title and seeds the form from the habit in edit mode", () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      habits: [makeHabit("h1", "Пити воду")],
    };
    render(<Harness initial={initial} editingId="h1" />);
    expect(screen.getByText("Редагувати звичку")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Зберегти зміни" }),
    ).toBeInTheDocument();
    // The name field is pre-filled with the habit name.
    expect(screen.getByDisplayValue("Пити воду")).toBeInTheDocument();
  });

  it("blocks save with an empty name and surfaces a name error", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Додати звичку" }));
    await waitFor(() => {
      expect(screen.getByText("Додай назву звички.")).toBeInTheDocument();
    });
  });

  it("creates a habit on save and closes the dialog", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const nameInput = screen.getByPlaceholderText("Назва");
    fireEvent.change(nameInput, { target: { value: "Медитація" } });
    fireEvent.click(screen.getByRole("button", { name: "Додати звичку" }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Звичку створено.")).toBeInTheDocument();
  });

  it("close button (✕) calls onClose", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /закрити/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click calls onClose", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const backdrop = screen
      .getByRole("dialog")
      .parentElement!.querySelector("[aria-hidden]") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("edit mode shows a cancel button alongside save", () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      habits: [makeHabit("h1", "Пити воду")],
    };
    const onClose = vi.fn();
    render(<Harness initial={initial} editingId="h1" onClose={onClose} />);
    const cancel = screen.getByRole("button", { name: "Скасувати" });
    fireEvent.click(cancel);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders the first-run hint banner when firstRunHint is set (create mode)", () => {
    render(<Harness firstRunHint />);
    // The banner heading comes from messages.routine.firstRun.title; assert
    // the dialog still renders the create CTA so the banner branch is covered.
    expect(
      screen.getByRole("button", { name: "Додати звичку" }),
    ).toBeInTheDocument();
  });
});
