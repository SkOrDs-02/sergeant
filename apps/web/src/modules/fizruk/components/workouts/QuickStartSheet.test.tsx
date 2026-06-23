// @vitest-environment jsdom
/**
 * Tests for the two-step QuickStartSheet workout launcher.
 *
 * step "choose": template vs. pick-exercises;
 * step "pick"  : grouped catalogue, multi-select, search filter, confirm.
 *
 * `useVisualKeyboardInset` (from @sergeant/shared) is a no-op in jsdom;
 * the Sheet renders into a portal that RTL's `screen` can still query.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { FizrukData } from "@sergeant/fizruk-domain";
import { QuickStartSheet } from "./QuickStartSheet";

type RawExerciseDef = FizrukData.RawExerciseDef;

const onClose = vi.fn();
const onPickTemplate = vi.fn();
const onConfirmExercises = vi.fn();

const EXERCISES: RawExerciseDef[] = [
  {
    id: "bench",
    name: { uk: "Жим лежачи", en: "Bench" },
    primaryGroup: "chest",
  } as RawExerciseDef,
  {
    id: "row",
    name: { uk: "Тяга", en: "Row" },
    primaryGroup: "back",
  } as RawExerciseDef,
  {
    id: "squat",
    name: { uk: "Присід", en: "Squat" },
    primaryGroup: "quadriceps",
  } as RawExerciseDef,
];

function search(q: string): RawExerciseDef[] {
  if (!q.trim()) return EXERCISES;
  return EXERCISES.filter((e) =>
    (e.name?.uk ?? "").toLowerCase().includes(q.toLowerCase()),
  );
}

function renderSheet(open = true) {
  return render(
    <QuickStartSheet
      open={open}
      onClose={onClose}
      exercises={EXERCISES}
      search={search}
      primaryGroupsUk={{
        chest: "Груди",
        back: "Спина",
        quadriceps: "Квадрицепс",
      }}
      onPickTemplate={onPickTemplate}
      onConfirmExercises={onConfirmExercises}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("QuickStartSheet — choose step", () => {
  it("renders nothing when closed", () => {
    renderSheet(false);
    expect(screen.queryByText("Почати тренування")).not.toBeInTheDocument();
  });

  it("renders the two path options on the choose step", () => {
    renderSheet();
    expect(screen.getByText("Почати тренування")).toBeInTheDocument();
    expect(screen.getByText("За шаблоном")).toBeInTheDocument();
    expect(screen.getByText("Підібрати вправи")).toBeInTheDocument();
  });

  it("'За шаблоном' closes the sheet and routes to templates", () => {
    renderSheet();
    fireEvent.click(screen.getByText("За шаблоном"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPickTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("QuickStartSheet — pick step", () => {
  function gotoPick() {
    renderSheet();
    fireEvent.click(screen.getByText("Підібрати вправи"));
  }

  it("switches to the pick step with the grouped catalogue", () => {
    gotoPick();
    expect(screen.getByText("Підібрати вправи")).toBeInTheDocument();
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.getByText("Тяга")).toBeInTheDocument();
    // Groups are labelled via primaryGroupsUk.
    expect(screen.getByText("Груди")).toBeInTheDocument();
  });

  it("filters the catalogue via the search input", () => {
    gotoPick();
    fireEvent.change(screen.getByLabelText("Пошук вправи в каталозі"), {
      target: { value: "жим" },
    });
    expect(screen.getByText("Жим лежачи")).toBeInTheDocument();
    expect(screen.queryByText("Тяга")).not.toBeInTheDocument();
  });

  it("shows the empty-result message for a non-matching query", () => {
    gotoPick();
    fireEvent.change(screen.getByLabelText("Пошук вправи в каталозі"), {
      target: { value: "zzz" },
    });
    expect(
      screen.getByText("Нічого не знайдено за цим запитом."),
    ).toBeInTheDocument();
  });

  it("the confirm button is disabled until at least one exercise is selected", () => {
    gotoPick();
    const confirm = screen.getByRole("button", { name: /Почати/ });
    expect(confirm).toBeDisabled();
  });

  it("selecting an exercise enables confirm and passes the picks", () => {
    gotoPick();
    fireEvent.click(screen.getByRole("button", { name: /Жим лежачи/ }));
    const confirm = screen.getByRole("button", { name: /Почати/ });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirmExercises).toHaveBeenCalledTimes(1);
    expect(onConfirmExercises.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ id: "bench" }),
    ]);
  });

  it("toggling an exercise off again clears the selection", () => {
    gotoPick();
    const benchBtn = screen.getByRole("button", { name: /Жим лежачи/ });
    fireEvent.click(benchBtn);
    expect(benchBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(benchBtn);
    expect(benchBtn).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Почати/ })).toBeDisabled();
  });

  it("'← Назад' returns to the choose step", () => {
    gotoPick();
    fireEvent.click(
      screen.getByRole("button", { name: "Повернутись до вибору способу" }),
    );
    expect(screen.getByText("За шаблоном")).toBeInTheDocument();
  });

  it("'Скасувати' on the pick step closes the sheet", () => {
    gotoPick();
    fireEvent.click(screen.getByRole("button", { name: "Скасувати" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
