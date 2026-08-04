// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { showUndoToastMock } = vi.hoisted(() => ({
  showUndoToastMock: vi.fn(),
}));
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@shared/lib/ui/undoToast", () => ({
  showUndoToast: showUndoToastMock,
}));

import { MealTemplatesRow } from "./MealTemplatesRow";
import type { MealFormState } from "./mealFormUtils";

const TEMPLATE = {
  id: "t1",
  name: "Омлет",
  mealType: "breakfast" as const,
  macros: { kcal: 280, protein_g: 18, fat_g: 20, carbs_g: 2 },
};

describe("MealTemplatesRow", () => {
  it("returns null when templates are empty", () => {
    const { container } = render(
      <MealTemplatesRow mealTemplates={[]} setForm={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("fills form from template and calls onSelected", () => {
    const setForm = vi.fn() as Dispatch<SetStateAction<MealFormState>>;
    const onSelected = vi.fn();
    render(
      <MealTemplatesRow
        mealTemplates={[TEMPLATE]}
        setForm={setForm}
        onSelected={onSelected}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Омлет" }));
    expect(setForm).toHaveBeenCalled();
    expect(onSelected).toHaveBeenCalled();
  });

  it("does not render edit/delete affordances without setPrefs", () => {
    render(<MealTemplatesRow mealTemplates={[TEMPLATE]} setForm={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: "Редагувати шаблон Омлет" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Видалити шаблон Омлет" }),
    ).toBeNull();
  });

  it("edit affordance fills form and reports the template", () => {
    const setForm = vi.fn() as Dispatch<SetStateAction<MealFormState>>;
    const onEditTemplate = vi.fn();
    render(
      <MealTemplatesRow
        mealTemplates={[TEMPLATE]}
        setForm={setForm}
        setPrefs={vi.fn()}
        onEditTemplate={onEditTemplate}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Редагувати шаблон Омлет" }),
    );
    expect(setForm).toHaveBeenCalled();
    expect(onEditTemplate).toHaveBeenCalledWith(TEMPLATE);
  });

  it("delete affordance asks for confirmation, then removes the template with an undo toast", () => {
    const setPrefs = vi.fn();
    showUndoToastMock.mockClear();
    render(
      <MealTemplatesRow
        mealTemplates={[TEMPLATE]}
        setForm={vi.fn()}
        setPrefs={setPrefs}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Видалити шаблон Омлет" }),
    );
    expect(screen.getByText("Видалити шаблон?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Видалити" }));
    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0];
    const next = updater({ mealTemplates: [TEMPLATE] });
    expect(next.mealTemplates).toHaveLength(0);
    expect(showUndoToastMock).toHaveBeenCalledTimes(1);
  });
});
