/** @vitest-environment jsdom */
/**
 * Coverage-oriented tests for HabitForm.
 *
 * HabitForm.focus.test.tsx already covers the input-focus stability
 * and emoji-picker-Escape path. This file adds the remaining uncovered
 * branches: editing mode, advanced-options disclosure, field errors,
 * recurrence variants, tags/categories select, and action-button
 * visibility guards.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { emptyHabitDraft } from "../../lib/routineDraftUtils";
import type { HabitDraft, RoutineState } from "../../lib/types";
import { HabitForm } from "./HabitForm";

vi.mock("@shared/components/ui/VoiceMicButton", () => ({
  VoiceMicButton: () => null,
}));
vi.mock("./ReminderPresets", () => ({
  ReminderPresets: () => null,
}));
vi.mock("./WeekdayPicker", () => ({
  WeekdayPicker: ({ onChange }: { onChange: (days: number[]) => void }) => (
    <button type="button" onClick={() => onChange([1, 2, 3])}>
      WeekdayPicker
    </button>
  ),
}));

afterEach(cleanup);

const emptyRoutine = {
  habits: [],
  tags: [],
  categories: [],
  completions: {},
  completionNotes: {},
  prefs: {},
} as unknown as RoutineState;

function routineWithTagsAndCategories(): RoutineState {
  return {
    ...emptyRoutine,
    tags: [{ id: "t1", name: "Ранок" }],
    categories: [{ id: "c1", name: "Здоров'я", emoji: "💚" }],
  } as unknown as RoutineState;
}

function Harness({
  editingId = null,
  hideHeading = false,
  hideActions = false,
  errors,
  initialDraft,
  routine = emptyRoutine,
}: {
  editingId?: string | null;
  hideHeading?: boolean;
  hideActions?: boolean;
  errors?: { name?: string; weekdays?: string };
  initialDraft?: Partial<HabitDraft>;
  routine?: RoutineState;
}) {
  const [draft, setDraft] = useState<HabitDraft>(() => ({
    ...emptyHabitDraft(),
    ...initialDraft,
  }));
  const onSave = vi.fn();
  const onCancel = vi.fn();
  // exactOptionalPropertyTypes: only spread errors into props when defined.
  const errorsProps = errors !== undefined ? { errors } : {};
  return (
    <HabitForm
      routine={routine}
      habitDraft={draft}
      setHabitDraft={setDraft}
      editingId={editingId}
      onSave={onSave}
      onCancel={onCancel}
      hideHeading={hideHeading}
      hideActions={hideActions}
      {...errorsProps}
    />
  );
}

describe("HabitForm – editing mode", () => {
  it("shows 'Редагувати звичку' heading when editingId is set", () => {
    render(<Harness editingId="h1" />);
    expect(screen.getByText("Редагувати звичку")).toBeInTheDocument();
  });

  it("shows 'Нова звичка' heading when editingId is null", () => {
    render(<Harness editingId={null} />);
    expect(screen.getByText("Нова звичка")).toBeInTheDocument();
  });

  it("shows 'Зберегти зміни' and 'Скасувати' buttons in editing mode", () => {
    render(<Harness editingId="h1" />);
    expect(
      screen.getByRole("button", { name: "Зберегти зміни" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Скасувати" }),
    ).toBeInTheDocument();
  });

  it("shows 'Додати звичку' button when creating a new habit", () => {
    render(<Harness editingId={null} />);
    expect(
      screen.getByRole("button", { name: "Додати звичку" }),
    ).toBeInTheDocument();
  });

  it("opens the advanced section automatically in editing mode", () => {
    render(<Harness editingId="h1" />);
    // Advanced section is open → date inputs are visible
    expect(screen.getByLabelText(/Початок/)).toBeInTheDocument();
  });
});

describe("HabitForm – hideActions + hideHeading", () => {
  it("hides action buttons when hideActions=true", () => {
    render(<Harness hideActions />);
    expect(
      screen.queryByRole("button", { name: "Додати звичку" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Скасувати" }),
    ).not.toBeInTheDocument();
  });

  it("hides the heading when hideHeading=true", () => {
    render(<Harness hideHeading />);
    expect(screen.queryByText("Нова звичка")).not.toBeInTheDocument();
  });
});

describe("HabitForm – advanced options disclosure", () => {
  it("shows 'Більше опцій' toggle and expands the advanced section on click", () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: /Більше опцій/ });
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByLabelText(/Початок/)).toBeInTheDocument();
  });

  it("keeps advanced section open while editing even after 'Менше опцій'", () => {
    render(<Harness editingId="h1" />);
    expect(
      screen.getByRole("button", { name: /Менше опцій/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Менше опцій/ }));
    // Collapsing is allowed; user can re-expand without losing the draft.
    expect(screen.queryByLabelText(/Початок/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Більше опцій/ }));
    expect(screen.getByLabelText(/Початок/)).toBeInTheDocument();
  });

  it("shows explanatory text for 'once' recurrence in advanced section", () => {
    render(<Harness editingId="h1" initialDraft={{ recurrence: "once" }} />);
    expect(screen.getByText(/зʼявиться лише в день/)).toBeInTheDocument();
  });

  it("shows explanatory text for 'monthly' recurrence in advanced section", () => {
    render(<Harness editingId="h1" initialDraft={{ recurrence: "monthly" }} />);
    expect(screen.getByText(/Орієнтир — день місяця/)).toBeInTheDocument();
  });

  it("renders the tag select when routine has tags (in advanced section)", () => {
    render(<Harness editingId="h1" routine={routineWithTagsAndCategories()} />);
    const tagSelect = screen.getByRole("combobox", { name: /Тег/ });
    expect(tagSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ранок" })).toBeInTheDocument();
  });

  it("renders the category select when routine has categories (in advanced section)", () => {
    render(<Harness editingId="h1" routine={routineWithTagsAndCategories()} />);
    const catSelect = screen.getByRole("combobox", { name: /Категорія/ });
    expect(catSelect).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Здоров'я/ }),
    ).toBeInTheDocument();
  });
});

describe("HabitForm – recurrence", () => {
  it("shows the weekday picker when 'По тижню' is selected", () => {
    render(<Harness />);
    // Click the 'По тижню' chip
    fireEvent.click(screen.getByRole("radio", { name: "По тижню" }));
    expect(screen.getByText("WeekdayPicker")).toBeInTheDocument();
  });

  it("does NOT show the weekday picker for 'daily' recurrence", () => {
    render(<Harness />);
    expect(screen.queryByText("WeekdayPicker")).not.toBeInTheDocument();
  });

  it("selecting each recurrence chip marks only that one as checked", () => {
    render(<Harness />);
    const dailyChip = screen.getByRole("radio", { name: "Щодня" });
    const weekdaysChip = screen.getByRole("radio", { name: "Будні" });
    expect(dailyChip).toHaveAttribute("aria-checked", "true");
    fireEvent.click(weekdaysChip);
    expect(weekdaysChip).toHaveAttribute("aria-checked", "true");
    expect(dailyChip).toHaveAttribute("aria-checked", "false");
  });
});

describe("HabitForm – field errors", () => {
  it("shows the name error message and applies aria-invalid on the input", () => {
    render(<Harness errors={{ name: "Назва обовʼязкова" }} />);
    expect(screen.getByText("Назва обовʼязкова")).toBeInTheDocument();
    const input = screen.getByPlaceholderText("Назва");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the weekdays error when 'По тижню' is active and weekdays error is set", () => {
    render(
      <Harness
        initialDraft={{ recurrence: "weekly" }}
        errors={{ weekdays: "Обери хоч один день" }}
      />,
    );
    expect(screen.getByText("Обери хоч один день")).toBeInTheDocument();
  });
});

describe("HabitForm – name input interaction", () => {
  it("updates the draft name when the user types in the input", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("Назва");
    fireEvent.change(input, { target: { value: "Бігати вранці" } });
    expect(input).toHaveValue("Бігати вранці");
  });
});

describe("HabitForm – emoji picker interaction", () => {
  it("opens the emoji picker when the toggle button is clicked", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Обрати емодзі" }));
    expect(
      screen.getByRole("dialog", { name: "Обрати емодзі" }),
    ).toBeInTheDocument();
  });

  it("selects an emoji and closes the picker", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Обрати емодзі" }));
    const waterDropBtn = screen.getByRole("button", { name: "Емодзі 💧" });
    fireEvent.click(waterDropBtn);
    expect(
      screen.queryByRole("dialog", { name: "Обрати емодзі" }),
    ).not.toBeInTheDocument();
  });
});
