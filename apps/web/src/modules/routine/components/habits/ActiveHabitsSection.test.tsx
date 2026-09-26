/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
  waitFor,
} from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import type { Habit, RoutineState } from "../../lib/types";
import { ActiveHabitsSection } from "./ActiveHabitsSection";

// HabitListItem renders "<emoji> <name>" in one span, so the emoji prefix
// splits the name across text nodes — match on a substring.
const hasText = (needle: string) => (content: string) =>
  content.includes(needle);

// Silence routineStorage persistence (writes through localStorage on every
// mutation). The tests only care about the post-update state + callbacks.
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

function makeHabit(id: string, name: string, _order: number): Habit {
  return {
    id,
    name,
    emoji: "✓",
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  } as unknown as Habit & { _order: number };
}

function makeRoutine(habits: Habit[]): RoutineState {
  return {
    ...defaultRoutineState(),
    habits,
    habitOrder: habits.map((h) => h.id),
  };
}

interface HarnessProps {
  initial: RoutineState;
  onEdit?: (h: Habit) => void;
  onCancelEditIf?: (id: string) => void;
  onOpenDetails?: (id: string) => void;
  onOpenCalendar?: () => void;
  onRequestDelete?: (p: unknown) => void;
  editingId?: string | null;
}

function Harness({
  initial,
  onEdit = vi.fn(),
  onCancelEditIf = vi.fn(),
  onOpenDetails = vi.fn(),
  onOpenCalendar,
  onRequestDelete = vi.fn(),
  editingId = null,
}: HarnessProps) {
  const [routine, setRoutine] = useState(initial);
  return (
    <ActiveHabitsSection
      routine={routine}
      setRoutine={setRoutine}
      editingId={editingId}
      onEdit={onEdit}
      onCancelEditIf={onCancelEditIf}
      onOpenDetails={onOpenDetails}
      {...(onOpenCalendar ? { onOpenCalendar } : {})}
      onRequestDelete={onRequestDelete}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActiveHabitsSection", () => {
  it("renders the section heading and the search input", () => {
    render(<Harness initial={defaultRoutineState()} />);
    expect(screen.getByText("Активні звички")).toBeInTheDocument();
    expect(screen.getByLabelText("Пошук звичок у списку")).toBeInTheDocument();
  });

  it("renders an empty state when there are no active habits", () => {
    render(<Harness initial={defaultRoutineState()} />);
    expect(screen.getByText("Поки порожньо")).toBeInTheDocument();
  });

  it("offers a 'Перейти до календаря' CTA only when onOpenCalendar is provided", () => {
    const onOpenCalendar = vi.fn();
    render(
      <Harness
        initial={defaultRoutineState()}
        onOpenCalendar={onOpenCalendar}
      />,
    );
    const cta = screen.getByRole("button", { name: "Перейти до календаря" });
    fireEvent.click(cta);
    expect(onOpenCalendar).toHaveBeenCalledTimes(1);
  });

  it("lists active habits and filters them by the search query", () => {
    const routine = makeRoutine([
      makeHabit("h1", "Вода", 0),
      makeHabit("h2", "Біг", 1),
    ]);
    render(<Harness initial={routine} />);
    expect(screen.getByText(hasText("Вода"))).toBeInTheDocument();
    expect(screen.getByText(hasText("Біг"))).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Пошук звичок у списку"), {
      target: { value: "вод" },
    });
    expect(screen.getByText(hasText("Вода"))).toBeInTheDocument();
    expect(screen.queryByText(hasText("Біг"))).not.toBeInTheDocument();
  });

  // Знахідка PR-R13: порожній РЕЗУЛЬТАТ ПОШУКУ — не те саме, що порожній
  // список. Тест вище пінує, що нерелевантні рядки зникають; він же був
  // зеленим і тоді, коли після них не лишалось нічого — ані пояснення, ані
  // виходу. Тому тут перевіряються обидві половини: і що стан зʼявився, і
  // що кнопка справді повертає список.
  it("shows a no-results state when the query matches nothing, and its CTA restores the list", () => {
    const routine = makeRoutine([
      makeHabit("h1", "Вода", 0),
      makeHabit("h2", "Біг", 1),
    ]);
    render(<Harness initial={routine} />);

    fireEvent.change(screen.getByLabelText("Пошук звичок у списку"), {
      target: { value: "зззз" },
    });
    expect(screen.getByText("Нічого не знайшов")).toBeInTheDocument();
    expect(screen.getByText(/«зззз»/)).toBeInTheDocument();
    expect(screen.queryByText(hasText("Вода"))).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Скинути пошук" }));
    expect(screen.queryByText("Нічого не знайшов")).not.toBeInTheDocument();
    expect(screen.getByText(hasText("Вода"))).toBeInTheDocument();
    expect(screen.getByText(hasText("Біг"))).toBeInTheDocument();
  });

  // Порожній список і порожній пошук не мають накладатись: коли активних
  // звичок немає взагалі, працює `EmptyState` «Поки порожньо», а не цей.
  it("keeps the no-habits empty state when the list is empty and a query is typed", () => {
    render(<Harness initial={makeRoutine([])} />);
    fireEvent.change(screen.getByLabelText("Пошук звичок у списку"), {
      target: { value: "будь-що" },
    });
    expect(screen.getByText("Поки порожньо")).toBeInTheDocument();
    expect(screen.queryByText("Нічого не знайшов")).not.toBeInTheDocument();
  });

  it("wires the Деталі button to onOpenDetails", () => {
    const onOpenDetails = vi.fn();
    const routine = makeRoutine([makeHabit("h1", "Вода", 0)]);
    render(<Harness initial={routine} onOpenDetails={onOpenDetails} />);
    fireEvent.click(screen.getByRole("button", { name: "Деталі" }));
    expect(onOpenDetails).toHaveBeenCalledWith("h1");
  });

  it("wires the Змінити button to onEdit with the habit", () => {
    const onEdit = vi.fn();
    const habit = makeHabit("h1", "Вода", 0);
    render(<Harness initial={makeRoutine([habit])} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Змінити" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0]![0]).toMatchObject({ id: "h1" });
  });

  // Перестановка ↑↓, «В архів» і «Видалити» живуть у меню «⋯» рядка
  // (design-critique: сім видимих «Видалити» на екрані), тож тести спершу
  // відкривають меню тим самим тригером і лише потім клікають пункт.
  function openRowMenu(row: HTMLElement) {
    fireEvent.click(
      within(row).getByRole("button", { name: /^Ще дії зі звичкою/ }),
    );
  }

  it("wires Видалити to onRequestDelete with a pending payload", () => {
    const onRequestDelete = vi.fn();
    const routine = makeRoutine([makeHabit("h1", "Вода", 0)]);
    render(<Harness initial={routine} onRequestDelete={onRequestDelete} />);
    const waterRow = screen
      .getByText(hasText("Вода"))
      .closest("li") as HTMLElement;
    openRowMenu(waterRow);
    fireEvent.click(screen.getByRole("menuitem", { name: "Видалити" }));
    expect(onRequestDelete).toHaveBeenCalledWith({
      id: "h1",
      name: "Вода",
      archived: false,
    });
  });

  it("archiving a habit removes it from the active list and calls onCancelEditIf", async () => {
    const onCancelEditIf = vi.fn();
    const routine = makeRoutine([
      makeHabit("h1", "Вода", 0),
      makeHabit("h2", "Біг", 1),
    ]);
    render(<Harness initial={routine} onCancelEditIf={onCancelEditIf} />);
    const waterRow = screen
      .getByText(hasText("Вода"))
      .closest("li") as HTMLElement;
    openRowMenu(waterRow);
    fireEvent.click(screen.getByRole("menuitem", { name: "В архів" }));
    await waitFor(() => {
      expect(screen.queryByText(hasText("Вода"))).not.toBeInTheDocument();
    });
    expect(onCancelEditIf).toHaveBeenCalledWith("h1");
    expect(screen.getByText(hasText("Біг"))).toBeInTheDocument();
  });

  it("reorders habits with the move-up menu item", async () => {
    const routine = makeRoutine([
      makeHabit("h1", "Вода", 0),
      makeHabit("h2", "Біг", 1),
    ]);
    render(<Harness initial={routine} />);
    const items = () => screen.getAllByRole("listitem");
    expect(within(items()[0]!).getByText(hasText("Вода"))).toBeInTheDocument();

    const bigRow = screen
      .getByText(hasText("Біг"))
      .closest("li") as HTMLElement;
    openRowMenu(bigRow);
    fireEvent.click(screen.getByRole("menuitem", { name: "Вище" }));

    await waitFor(() => {
      expect(
        within(screen.getAllByRole("listitem")[0]!).getByText(hasText("Біг")),
      ).toBeInTheDocument();
    });
  });

  it("reorders habits with the move-down menu item", async () => {
    const routine = makeRoutine([
      makeHabit("h1", "Вода", 0),
      makeHabit("h2", "Біг", 1),
    ]);
    render(<Harness initial={routine} />);
    const waterRow = screen
      .getByText(hasText("Вода"))
      .closest("li") as HTMLElement;
    openRowMenu(waterRow);
    fireEvent.click(screen.getByRole("menuitem", { name: "Нижче" }));
    await waitFor(() => {
      expect(
        within(screen.getAllByRole("listitem")[0]!).getByText(hasText("Біг")),
      ).toBeInTheDocument();
    });
  });

  it("reorders habits via drag and drop", async () => {
    const routine = makeRoutine([
      makeHabit("h1", "Вода", 0),
      makeHabit("h2", "Біг", 1),
    ]);
    render(<Harness initial={routine} />);
    const waterRow = screen
      .getByText(hasText("Вода"))
      .closest("li") as HTMLElement;
    const bigRow = screen
      .getByText(hasText("Біг"))
      .closest("li") as HTMLElement;

    // Minimal DataTransfer shim for the drag handlers.
    const data: Record<string, string> = {};
    const dataTransfer = {
      setData: (k: string, v: string) => {
        data[k] = v;
      },
      getData: (k: string) => data[k] ?? "",
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.dragStart(waterRow, { dataTransfer });
    fireEvent.dragOver(bigRow, { dataTransfer });
    fireEvent.drop(bigRow, { dataTransfer });
    fireEvent.dragEnd(waterRow, { dataTransfer });

    await waitFor(() => {
      expect(
        within(screen.getAllByRole("listitem")[0]!).getByText(hasText("Біг")),
      ).toBeInTheDocument();
    });
  });
});
