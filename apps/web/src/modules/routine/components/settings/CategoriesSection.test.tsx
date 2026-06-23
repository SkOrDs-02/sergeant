/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import type { CategoryDraft, RoutineState } from "../../lib/types";
import { CategoriesSection } from "./CategoriesSection";

// `routineStorage` writes through localStorage on every mutation. Silence
// the storage layer so the tests stay deterministic and only exercise the
// pure reducer + component behaviour. (Mirrors TagsSection.test.)
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

// Category list renders "<emoji> <name>" inside a single span, so the
// emoji prefix splits the text into nodes — use a substring matcher.
const hasText = (needle: string) => (content: string) =>
  content.includes(needle);

function Harness({ initial }: { initial: RoutineState }) {
  const [routine, setRoutine] = useState(initial);
  const [catDraft, setCatDraft] = useState<CategoryDraft>({
    name: "",
    emoji: "",
  });
  return (
    <ToastProvider>
      <CategoriesSection
        routine={routine}
        setRoutine={setRoutine}
        catDraft={catDraft}
        setCatDraft={setCatDraft}
      />
      <ToastContainer />
    </ToastProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CategoriesSection", () => {
  it("renders the create heading and inputs", () => {
    render(<Harness initial={defaultRoutineState()} />);
    expect(screen.getByText("Категорії")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Назва категорії")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("🏠")).toBeInTheDocument();
  });

  it("creates a category from the draft and lists it with a habit count", async () => {
    render(<Harness initial={defaultRoutineState()} />);
    fireEvent.change(screen.getByPlaceholderText("Назва категорії"), {
      target: { value: "Здоров'я" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    await waitFor(() => {
      expect(screen.getByText(hasText("Здоров'я"))).toBeInTheDocument();
    });
    // 0 habits -> "звичок" plural form.
    expect(screen.getByText(/0\s+звичок/)).toBeInTheDocument();
  });

  it("ignores an empty (blank) name on create", () => {
    render(<Harness initial={defaultRoutineState()} />);
    fireEvent.change(screen.getByPlaceholderText("Назва категорії"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("warns on a duplicate name instead of adding it twice", async () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      categories: [{ id: "c1", name: "Дім", emoji: "🏠" }],
    };
    render(<Harness initial={initial} />);
    fireEvent.change(screen.getByPlaceholderText("Назва категорії"), {
      target: { value: "дім" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Додати" }));
    await waitFor(() => {
      expect(
        screen.getByText("Категорія з такою назвою вже існує"),
      ).toBeInTheDocument();
    });
    // Still exactly one list item.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("enters edit mode, changes the heading, and saves the rename", async () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      categories: [{ id: "c1", name: "Дім", emoji: "🏠" }],
    };
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Змінити Дім" }));
    expect(screen.getByText("Редагувати категорію")).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText("Назва категорії");
    fireEvent.change(nameInput, { target: { value: "Дача" } });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    await waitFor(() => {
      expect(screen.getByText(hasText("Дача"))).toBeInTheDocument();
    });
    expect(screen.getByText("Категорії")).toBeInTheDocument();
  });

  it("cancel exits edit mode without renaming", () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      categories: [{ id: "c1", name: "Дім", emoji: "🏠" }],
    };
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Змінити Дім" }));
    fireEvent.change(screen.getByPlaceholderText("Назва категорії"), {
      target: { value: "X" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(screen.getByText("Категорії")).toBeInTheDocument();
    expect(screen.getByText(hasText("Дім"))).toBeInTheDocument();
  });

  it("warns when renaming would collide with another category", async () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      categories: [
        { id: "c1", name: "Дім", emoji: "🏠" },
        { id: "c2", name: "Спорт", emoji: "🏋️" },
      ],
    };
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Змінити Спорт" }));
    fireEvent.change(screen.getByPlaceholderText("Назва категорії"), {
      target: { value: "дім" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Зберегти" }));
    await waitFor(() => {
      expect(
        screen.getByText("Категорія з такою назвою вже існує"),
      ).toBeInTheDocument();
    });
  });

  it("deletes a category and offers an undo toast", async () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      categories: [{ id: "c1", name: "Дім", emoji: "🏠" }],
    };
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Видалити Дім" }));
    // The category list item is gone (the only <li> disappears).
    await waitFor(() => {
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    });
    // Undo toast surfaces with a restore action.
    const undo = await screen.findByText(/Видалено категорію/);
    expect(undo).toBeInTheDocument();
  });

  it("shows the singular 'звичка' label for a category with exactly one habit", () => {
    const initial: RoutineState = {
      ...defaultRoutineState(),
      categories: [{ id: "c1", name: "Дім", emoji: "🏠" }],
      habits: [
        {
          ...makeHabit("h1"),
          categoryId: "c1",
        },
      ],
    };
    render(<Harness initial={initial} />);
    const item = screen.getByText(hasText("Дім")).closest("li") as HTMLElement;
    expect(within(item).getByText(/1\s+звичка/)).toBeInTheDocument();
  });
});

function makeHabit(id: string) {
  return {
    id,
    name: `Habit ${id}`,
    emoji: "✓",
    tagIds: [],
    categoryId: null,
    recurrence: "daily" as const,
    startDate: "2026-01-01",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived: false,
  };
}
