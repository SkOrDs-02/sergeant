// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "@shared/hooks/useToast";
import type { FizrukData } from "@sergeant/fizruk-domain";
import { WorkoutTemplatesSection } from "./WorkoutTemplatesSection";
import type { WorkoutTemplate } from "../hooks/useWorkoutTemplates";

afterEach(cleanup);

const EXERCISES = [
  { id: "bench", name: { uk: "Жим лежачи" } },
  { id: "squat", name: { uk: "Присідання" } },
  { id: "row", name: { uk: "Тяга" } },
] as unknown as FizrukData.RawExerciseDef[];

function wrap(children: ReactNode) {
  return <ToastProvider>{children}</ToastProvider>;
}

function baseProps(templates: WorkoutTemplate[] = []) {
  return {
    exercises: EXERCISES,
    search: (q: string) =>
      EXERCISES.filter((e) =>
        (e.name?.uk ?? "").toLowerCase().includes(q.toLowerCase()),
      ),
    templates,
    addTemplate: vi.fn(
      (name: string, exerciseIds: string[]) =>
        ({ id: "t-new", name, exerciseIds }) as WorkoutTemplate,
    ),
    updateTemplate: vi.fn(),
    removeTemplate: vi.fn(),
    restoreTemplate: vi.fn(),
    onStartTemplate: vi.fn(),
  };
}

describe("WorkoutTemplatesSection", () => {
  it("shows the empty-state when no templates exist", () => {
    render(wrap(<WorkoutTemplatesSection {...baseProps()} />));
    expect(screen.getByText("Поки немає шаблонів")).toBeInTheDocument();
  });

  it("lists saved templates with exercise counts and a superset badge", () => {
    const templates = [
      {
        id: "t1",
        name: "Push Day",
        exerciseIds: ["bench", "squat"],
        groups: [
          { id: "g1", type: "superset", exerciseIds: ["bench", "squat"] },
        ],
      },
    ] as unknown as WorkoutTemplate[];
    render(wrap(<WorkoutTemplatesSection {...baseProps(templates)} />));
    expect(screen.getByText("Push Day")).toBeInTheDocument();
    expect(screen.getByText(/суперсет/)).toBeInTheDocument();
  });

  it("opens the editor, adds an exercise, and saves a new template", () => {
    const props = baseProps();
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("+ Новий шаблон"));
    // name input
    fireEvent.change(screen.getByLabelText("Назва шаблону"), {
      target: { value: "Leg Day" },
    });
    // add an exercise from the catalog pick list
    fireEvent.click(screen.getByText("Жим лежачи"));
    expect(screen.getByText(/Порядок \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Зберегти"));
    expect(props.addTemplate).toHaveBeenCalledWith("Leg Day", ["bench"], {
      groups: [],
    });
  });

  it("does not save when no exercises were added", () => {
    const props = baseProps();
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("+ Новий шаблон"));
    // Save button disabled with no exercises
    const save = screen.getByText("Зберегти");
    expect(save).toBeDisabled();
  });

  it("filters the pick list via search", () => {
    const props = baseProps();
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("+ Новий шаблон"));
    fireEvent.change(screen.getByLabelText("Пошук вправи для шаблону"), {
      target: { value: "присід" },
    });
    expect(screen.getByText("Присідання")).toBeInTheDocument();
    expect(screen.queryByText("Жим лежачи")).not.toBeInTheDocument();
  });

  it("starts a template via the Почати button", () => {
    const templates = [
      { id: "t1", name: "A", exerciseIds: ["bench"], groups: [] },
    ] as unknown as WorkoutTemplate[];
    const props = baseProps(templates);
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("Почати"));
    expect(props.onStartTemplate).toHaveBeenCalledWith(templates[0]);
  });

  it("edits an existing template via Змінити", () => {
    const templates = [
      { id: "t1", name: "Edit Me", exerciseIds: ["bench"], groups: [] },
    ] as unknown as WorkoutTemplate[];
    const props = baseProps(templates);
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("Змінити"));
    expect(screen.getByLabelText("Назва шаблону")).toHaveValue("Edit Me");
    expect(screen.getByText(/Порядок \(1\)/)).toBeInTheDocument();
  });

  it("reorders and removes exercises in the editor", () => {
    const props = baseProps();
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("+ Новий шаблон"));
    fireEvent.click(screen.getByText("Жим лежачи"));
    fireEvent.click(screen.getByText("Присідання"));
    expect(screen.getByText(/Порядок \(2\)/)).toBeInTheDocument();
    // Move the first item down.
    fireEvent.click(screen.getAllByLabelText("Нижче")[0]!);
    // Remove an item.
    fireEvent.click(screen.getAllByLabelText("Прибрати з шаблону")[0]!);
    expect(screen.getByText(/Порядок \(1\)/)).toBeInTheDocument();
  });

  it("creates a superset group from two selected exercises", () => {
    const props = baseProps();
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("+ Новий шаблон"));
    fireEvent.click(screen.getByText("Жим лежачи"));
    fireEvent.click(screen.getByText("Присідання"));
    // Enter superset select mode.
    fireEvent.click(screen.getByText("⊕ Суперсет"));
    // Select both items.
    const checkboxes = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("w-5 h-5"));
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    // Create the superset.
    fireEvent.click(screen.getByText(/Суперсет \(2\/3\)/));
    // Superset pills ("СС") appear on the grouped order-list items.
    expect(screen.getAllByText("СС").length).toBeGreaterThanOrEqual(1);
  });

  it("cancels the editor", () => {
    const props = baseProps();
    render(wrap(<WorkoutTemplatesSection {...props} />));
    fireEvent.click(screen.getByText("+ Новий шаблон"));
    fireEvent.click(screen.getByText("Скасувати"));
    expect(screen.getByText("+ Новий шаблон")).toBeInTheDocument();
  });

  it("confirms deletion and fires the remove + undo restore", () => {
    const templates = [
      { id: "t1", name: "Bye", exerciseIds: ["bench"], groups: [] },
    ] as unknown as WorkoutTemplate[];
    const props = baseProps(templates);
    render(wrap(<WorkoutTemplatesSection {...props} />));
    const deleteBtn = screen.getByRole("button", {
      name: "Видалити шаблон Bye",
    });
    fireEvent.click(deleteBtn);
    // ConfirmDialog appears.
    fireEvent.click(screen.getByText("Видалити"));
    expect(props.removeTemplate).toHaveBeenCalledWith("t1");
  });
});
